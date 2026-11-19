import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';
import CollectPaymentModal from '../fee/CollectPaymentModal.jsx';
import StudentFeeStructurePanel from '../students/StudentFeeStructurePanel.jsx';
import StudentPaymentsTable from './StudentPaymentsTable.jsx';
import StudentDiscountForm from './StudentDiscountForm.jsx';
import { formatCurrency, formatDate } from '../../utils/intl.js';
import {
  ENTITLEMENT_VARIANT,
  collectableFees,
  dayText,
  discountStatus,
  planHistory,
} from '../../utils/feePlan.js';

const prefix = 'studyCenter.studentBilling';

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h3 className="text-xs font-semibold uppercase text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

// Whether the learner may come in today, and what is owed if not.
function EntitlementLine({ studentId }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['student-entitlement', studentId],
    queryFn: () => api.get('/fee/entitlement', { params: { studentId } }).then((r) => r.data),
  });
  if (!data) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Badge variant={ENTITLEMENT_VARIANT[data.status] ?? 'default'} data-testid="entitlement">
        {t(`studyCenter.studentVisits.entitlement.${data.status}`)}
      </Badge>
      {data.overdue > 0 && (
        <span className="text-destructive">
          {t(`${prefix}.overdue`, { amount: formatCurrency(data.overdue) })}
        </span>
      )}
    </div>
  );
}

// The plan's life: each stretch on a structure, each pause, and when billing ended.
function PlanHistory({ studentId, locale }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['student-billing', studentId],
    queryFn: () => api.get(`/fee/students/${studentId}/billing`).then((r) => r.data),
  });
  const rows = planHistory(data?.plan);
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t(`${prefix}.noHistory`)}</p>;
  }
  const range = (r) =>
    r.to
      ? t(`${prefix}.fromTo`, { from: dayText(r.from, locale), to: dayText(r.to, locale) })
      : t(`${prefix}.fromOn`, { from: dayText(r.from, locale) });
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {rows.map((r) => (
        <li key={`${r.kind}-${r.from}`} className="flex flex-wrap gap-x-2">
          {r.kind === 'plan' && (
            <span>
              {t(`${prefix}.historyPlan`, {
                name: r.name ?? '—',
                amount: formatCurrency(r.amount),
                cycle: t(
                  r.cycle === 'weekly' ? 'studyCenter.plan.weekly' : 'studyCenter.plan.monthly'
                ),
              })}
            </span>
          )}
          {r.kind === 'pause' && <span>{t(`${prefix}.historyPause`)}</span>}
          {r.kind === 'ended' && (
            <span>{t(`${prefix}.historyEnded`, { day: dayText(r.from, locale) })}</span>
          )}
          {r.kind !== 'ended' && <span className="text-muted-foreground">{range(r)}</span>}
        </li>
      ))}
    </ul>
  );
}

// The learner's own discounts: applied automatically to every cycle inside its dates.
function StandingDiscounts({ studentId }) {
  const { t } = useTranslation();
  const { data: discounts = [] } = useQuery({
    queryKey: ['student-discounts', studentId],
    queryFn: () => api.get('/fee/discounts', { params: { studentId } }).then((r) => r.data),
  });
  const mine = discounts.filter((d) => d.applicableTo === 'student');
  if (mine.length === 0) {
    return <p className="text-sm text-muted-foreground">{t(`${prefix}.noDiscount`)}</p>;
  }
  const variant = { active: 'success', upcoming: 'warning', ended: 'secondary' };
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {mine.map((d) => {
        const status = discountStatus(d);
        return (
          <li key={d._id} className="flex flex-wrap items-center gap-2">
            <span>
              {d.name} · {d.type === 'percentage' ? `${d.value}%` : formatCurrency(d.value)}
            </span>
            <Badge variant={variant[status]}>{t(`${prefix}.discount_${status}`)}</Badge>
            <span className="text-muted-foreground">
              {d.validTo
                ? t(`${prefix}.until`, { date: formatDate(d.validTo) })
                : t(`${prefix}.noEnd`)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// What the learner owes right now, fee by fee, each with a way to take a payment.
function AmountsDue({ studentId, learnerName, canCollect, onDone }) {
  const { t } = useTranslation();
  const [paying, setPaying] = useState(null);
  const { data: assignments = [] } = useQuery({
    queryKey: ['student-fee-assignments', studentId],
    queryFn: () => api.get(`/fee/assignments?studentId=${studentId}`).then((r) => r.data),
  });
  const rows = collectableFees(assignments);
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t(`${prefix}.nothingDue`)}</p>;
  }
  return (
    <>
      <ul className="flex flex-col gap-2 text-sm">
        {rows.map(({ assignment, payable }) => (
          <li key={assignment._id} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {assignment.feeStructureId?.name ?? '—'}
              <span className="text-muted-foreground">
                {' · '}
                {t(`${prefix}.payable`, { amount: formatCurrency(payable) })}
              </span>
            </span>
            {canCollect && (
              <Button size="sm" variant="outline" onClick={() => setPaying(assignment)}>
                {t(`${prefix}.collect`)}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {paying && (
        <CollectPaymentModal
          open
          onOpenChange={(open) => !open && setPaying(null)}
          assignment={paying}
          learnerName={learnerName}
          onDone={onDone}
        />
      )}
    </>
  );
}

/**
 * A study-center learner's money in one place: whether they may come in, their plan
 * and its cycles (with pause and resume), what is due now with a way to take a payment,
 * the plan's history, their standing discount and every payment with its receipt (and a
 * refund for the owner).
 */
export default function StudentBillingTab({
  studentId,
  canWrite,
  canCollect = false,
  canRefund = false,
  canAddDiscount = false,
  learnerName,
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const locale = i18n.language?.startsWith('hi') ? 'hi-IN' : 'en-IN';
  // Money moved: the ledger, the payments, what is due, the badge and the history all change.
  const refresh = () =>
    [
      'student-payments',
      'student-billing',
      'student-fee-assignments',
      'student-entitlement',
      'student-history',
    ].forEach((key) => queryClient.invalidateQueries({ queryKey: [key, studentId] }));
  return (
    <div className="flex flex-col gap-5">
      <EntitlementLine studentId={studentId} />
      <StudentFeeStructurePanel studentId={studentId} canWrite={canWrite} />
      <Section title={t(`${prefix}.dueHeading`)}>
        <AmountsDue
          studentId={studentId}
          learnerName={learnerName}
          canCollect={canCollect}
          onDone={refresh}
        />
      </Section>
      <Section title={t(`${prefix}.historyHeading`)}>
        <PlanHistory studentId={studentId} locale={locale} />
      </Section>
      <Section title={t(`${prefix}.discountHeading`)}>
        <StandingDiscounts studentId={studentId} />
        {canAddDiscount && <StudentDiscountForm studentId={studentId} onDone={refresh} />}
      </Section>
      <Section title={t(`${prefix}.paymentsHeading`)}>
        <StudentPaymentsTable studentId={studentId} canRefund={canRefund} onDone={refresh} />
      </Section>
    </div>
  );
}
