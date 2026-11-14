import { EmailLog } from '../models/EmailLog.js';
import { env } from '../config/env.js';

// Days are bucketed in the operators' timezone so "today" matches their clock.
const TZ = 'Asia/Kolkata';
const DAY_MS = 24 * 60 * 60 * 1000;
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }); // YYYY-MM-DD

/** The last `days` IST calendar days, oldest first. */
function lastDays(days, now) {
  return Array.from({ length: days }, (_, i) =>
    dayFmt.format(new Date(now - (days - 1 - i) * DAY_MS))
  );
}

/**
 * Per-day counts by status, top failure reasons and totals for the last `days`
 * days. `dailyLimit` echoes EMAIL_DAILY_LIMIT (the provider's free-tier cap) so
 * the page can show how close sends run to it.
 */
export async function getEmailStats({ days = 30, now = Date.now() } = {}) {
  const dayList = lastDays(days, now);
  // One extra day of slack so the oldest IST day is never cut off mid-day.
  const since = new Date(now - (days + 1) * DAY_MS);

  const [perDay, reasons] = await Promise.all([
    EmailLog.aggregate([
      { $match: { at: { $gte: since } } },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: '%Y-%m-%d', date: '$at', timezone: TZ } },
            status: '$status',
          },
          n: { $sum: 1 },
        },
      },
    ]),
    EmailLog.aggregate([
      { $match: { at: { $gte: since }, status: 'failed' } },
      { $group: { _id: '$reason', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]),
  ]);

  const byDay = new Map(dayList.map((day) => [day, { day, sent: 0, failed: 0, skipped: 0 }]));
  for (const { _id, n } of perDay) {
    const row = byDay.get(_id.day);
    if (row) row[_id.status] += n;
  }
  const daily = [...byDay.values()];

  const totals = daily.reduce(
    (t, d) => ({
      sent: t.sent + d.sent,
      failed: t.failed + d.failed,
      skipped: t.skipped + d.skipped,
    }),
    { sent: 0, failed: 0, skipped: 0 }
  );
  const attempted = totals.sent + totals.failed;
  const peak = daily.reduce((best, d) => (d.sent > best.sent ? d : best), daily[0]);

  return {
    days,
    dailyLimit: env.EMAIL_DAILY_LIMIT ?? null,
    today: daily[daily.length - 1],
    totals: { ...totals, failureRate: attempted ? totals.failed / attempted : null },
    peakDay: peak.sent ? { day: peak.day, sent: peak.sent } : null,
    reasons: reasons.map((r) => ({ reason: r._id ?? 'other', count: r.n })),
    daily,
  };
}
