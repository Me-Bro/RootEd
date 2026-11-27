import { resolveWhatsapp } from '@rooted/shared/utils';
import { ExpenseEntry } from '../models/ExpenseEntry.js';
import { FeeAssignment } from '../models/FeeAssignment.js';
import { FeePayment } from '../models/FeePayment.js';
import { Student } from '../models/Student.js';
import { dayStringInTz, zonedMidnight } from '../utils/dayKey.js';
import { fullName } from '../utils/fullName.js';
import {
  collectionTrend,
  expenseTrend,
  lastMonths,
  monthDayBounds,
  pendingByMonth,
  pendingByStudent,
  pendingItems,
  pendingTotals,
  summarizeCollection,
  summarizeExpenses,
} from '../utils/centreFinance.js';
import { withBalances } from './fee.service.js';

/**
 * A study center's money for the owner: what it spent, what it collected, and what
 * learners still owe. The arithmetic lives in utils/centreFinance.js; this file only
 * fetches the rows and resolves the centre's calendar.
 */

const TREND_MONTHS = 6;

const todayOf = (tenant, now) => dayStringInTz(now, tenant.timezone);

/** The month asked for, else the current month on the centre's calendar. */
export const resolveMonth = (tenant, month, now = new Date()) =>
  month ?? todayOf(tenant, now).slice(0, 7);

// Expenses hold a calendar day (a UTC-midnight Date), so the window is in UTC.
async function loadExpenses(tenantId, months) {
  const from = new Date(`${monthDayBounds(months[0]).from}T00:00:00.000Z`);
  const to = new Date(`${monthDayBounds(months.at(-1)).to}T00:00:00.000Z`);
  return ExpenseEntry.find(
    { tenantId, status: { $in: ['approved', 'paid'] }, invoiceDate: { $gte: from, $lt: to } },
    'status invoiceDate category amount'
  ).lean();
}

// Payments are real instants, so the window is the centre's own midnights.
async function loadPayments(tenant, months) {
  const from = zonedMidnight(monthDayBounds(months[0]).from, tenant.timezone);
  const to = zonedMidnight(monthDayBounds(months.at(-1)).to, tenant.timezone);
  return FeePayment.find(
    { tenantId: tenant._id, paymentDate: { $gte: from, $lt: to } },
    'amount paymentMethod paymentDate refunded'
  ).lean();
}

/** Spent in `month`, by category, with the last six months beside it. */
export async function expenseSummary(tenant, month) {
  const months = lastMonths(month, TREND_MONTHS);
  const entries = await loadExpenses(tenant._id, months);
  return { ...summarizeExpenses(entries, month), trend: expenseTrend(entries, months) };
}

/** Collected in `month`, by payment method, with the last six months beside it. */
export async function monthlyCollection(tenant, month) {
  const months = lastMonths(month, TREND_MONTHS);
  const payments = await loadPayments(tenant, months);
  return {
    ...summarizeCollection(payments, month, tenant.timezone),
    trend: collectionTrend(payments, months, tenant.timezone),
  };
}

// Every assignment that can still owe something, turned into items. A cycle plan's
// balances come from its computed ledger, never from its stored status or totals.
async function loadPendingItems(tenant, now) {
  const assignments = await FeeAssignment.find({
    tenantId: tenant._id,
    status: { $ne: 'waived' },
  }).lean();
  const withBalance = await withBalances(tenant._id, assignments, { cycles: true });
  const ctx = { today: todayOf(tenant, now), timezone: tenant.timezone };
  return { items: withBalance.flatMap((a) => pendingItems(a, ctx)), ctx };
}

/** Month, collected, spent and what is left, with the last six months and what is owed now. */
export async function financeOverview(tenant, month, now = new Date()) {
  const months = lastMonths(month, TREND_MONTHS);
  const [entries, payments, { items }] = await Promise.all([
    loadExpenses(tenant._id, months),
    loadPayments(tenant, months),
    loadPendingItems(tenant, now),
  ]);
  const spent = summarizeExpenses(entries, month);
  const collected = summarizeCollection(payments, month, tenant.timezone);
  const spentTrend = expenseTrend(entries, months);
  const collectedTrend = collectionTrend(payments, months, tenant.timezone);

  return {
    month,
    collected: collected.total,
    spent: spent.total,
    net: Math.round((collected.total - spent.total) * 100) / 100,
    categories: spent.categories,
    methods: collected.methods,
    trend: months.map((m, i) => ({
      month: m,
      collected: collectedTrend[i].total,
      spent: spentTrend[i].total,
      net: Math.round((collectedTrend[i].total - spentTrend[i].total) * 100) / 100,
    })),
    owed: pendingTotals(items),
  };
}

/**
 * What learners still owe, per learner or per month. A learner row carries their
 * name, admission number and phone; `q` narrows by any of them.
 */
export async function pendingFees(
  tenant,
  { view = 'student', q, months = 12 } = {},
  now = new Date()
) {
  const { items, ctx } = await loadPendingItems(tenant, now);
  const totals = pendingTotals(items);

  if (view === 'month') {
    return { view, totals, months: pendingByMonth(items, ctx).slice(0, months) };
  }

  const rows = pendingByStudent(items);
  const students = await Student.find(
    { tenantId: tenant._id, _id: { $in: rows.map((r) => r.studentId) } },
    'firstName lastName admissionNo phone whatsappNumber whatsappSameAsPhone kind status'
  ).lean();
  const byId = new Map(students.map((s) => [String(s._id), s]));

  let learners = rows.map((r) => {
    const s = byId.get(String(r.studentId));
    return {
      ...r,
      name: fullName(s, '—'),
      admissionNo: s?.admissionNo ?? null,
      phone: s?.phone ?? null,
      whatsapp: resolveWhatsapp(s) ?? s?.phone ?? null,
      status: s?.status ?? null,
    };
  });
  if (q) {
    const needle = q.toLowerCase();
    learners = learners.filter((l) =>
      [l.name, l.admissionNo, l.phone].some((v) => v && String(v).toLowerCase().includes(needle))
    );
  }
  return { view, totals, learners };
}
