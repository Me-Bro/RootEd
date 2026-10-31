import { useTranslation } from 'react-i18next';
import { Badge } from '../ui/Badge.jsx';
import { Card, CardContent } from '../ui/Card.jsx';
import { formatCurrency } from '../../utils/intl.js';
import { absentRun, currentAndNext, recentStrip } from '../../utils/studentHome.js';

// Shown as a warning once a student has missed this many school days in a row.
const ABSENT_RUN_ALERT = 3;
const STATUS_VARIANT = {
  present: 'success',
  absent: 'danger',
  late: 'warning',
  excused: 'secondary',
};

function HomeCard({ title, badge, children }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {badge}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export function NowNextCard({ timetable, now }) {
  const { t } = useTranslation();
  if (!timetable.length) return null;

  const { current, next, minutesLeft, minutesToNext, hasClassesToday } = currentAndNext(
    timetable,
    now
  );
  const period = current ?? next;
  const nameOf = (e) => e.subjectId?.name ?? '—';

  if (!period) {
    return (
      <HomeCard title={t('dashboard.student.todayLabel')}>
        <p className="text-sm text-muted-foreground">
          {hasClassesToday
            ? t('dashboard.student.noMoreClasses')
            : t('dashboard.student.noClassesToday')}
        </p>
      </HomeCard>
    );
  }

  return (
    <HomeCard
      title={current ? t('dashboard.student.nowLabel') : t('dashboard.student.upNextLabel')}
      badge={
        <Badge variant={current ? 'success' : 'secondary'}>
          {current
            ? t('dashboard.student.minutesLeft', { count: minutesLeft })
            : t('dashboard.student.minutesUntil', { count: minutesToNext })}
        </Badge>
      }
    >
      <p className="text-xl font-semibold text-foreground">{nameOf(period)}</p>
      <p className="text-xs text-muted-foreground">
        {[period.room, `${period.startTime}–${period.endTime}`].filter(Boolean).join(' · ')}
      </p>
      {current && next && (
        <p className="text-xs text-muted-foreground">
          {t('dashboard.student.thenNext', { subject: nameOf(next), time: next.startTime })}
        </p>
      )}
    </HomeCard>
  );
}

export function AttendanceCard({ records }) {
  const { t } = useTranslation();
  if (!records.length) return null;

  const present = records.filter((r) => r.status === 'present' || r.status === 'late').length;
  const run = absentRun(records);

  return (
    <HomeCard
      title={t('dashboard.student.attendanceLabel')}
      badge={
        run >= ABSENT_RUN_ALERT && (
          <Badge variant="danger">{t('dashboard.student.absentRun', { count: run })}</Badge>
        )
      }
    >
      <div className="flex flex-wrap gap-1.5" role="list">
        {recentStrip(records).map((r) => (
          <Badge
            key={r._id ?? r.date}
            role="listitem"
            variant={STATUS_VARIANT[r.status] ?? 'secondary'}
            aria-label={t(`dashboard.student.status.${r.status}`, r.status)}
          >
            {t(`dashboard.student.statusLetter.${r.status}`, r.status[0].toUpperCase())}
          </Badge>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {t('dashboard.student.attendanceSummary', {
          pct: Math.round((present / records.length) * 100),
          count: records.length,
        })}
      </p>
    </HomeCard>
  );
}

export function FeeCard({ fees, now }) {
  const { t } = useTranslation();
  const assignments = fees?.assignments ?? [];
  const payments = fees?.payments ?? [];
  const due = assignments.reduce((sum, a) => sum + a.totalAmount - (a.discountAmount || 0), 0);
  const balance = due - payments.reduce((sum, p) => sum + p.amount, 0);
  const overdue = assignments.some(
    (a) =>
      (a.status === 'unpaid' || a.status === 'partial') && a.dueDate && new Date(a.dueDate) < now
  );

  return (
    <HomeCard
      title={t('dashboard.student.feeBalanceLabel')}
      badge={
        balance > 0 ? (
          overdue && <Badge variant="danger">{t('dashboard.student.feeOverdue')}</Badge>
        ) : (
          <Badge variant="success">{t('dashboard.student.feePaidUp')}</Badge>
        )
      }
    >
      <p className="text-xl font-semibold text-foreground">{formatCurrency(balance)}</p>
      {balance > 0 && !payments.length && (
        <p className="text-xs text-muted-foreground">{t('dashboard.student.feeNoPayments')}</p>
      )}
    </HomeCard>
  );
}

export function GradesCard({ grades }) {
  const { t } = useTranslation();
  const scored = grades.filter((g) => typeof g.score === 'number');
  const label = (g) => `${g.subject?.name ?? '—'} ${g.score}`;
  const high = scored.reduce((a, b) => (b.score > a.score ? b : a), scored[0]);
  const low = scored.reduce((a, b) => (b.score < a.score ? b : a), scored[0]);

  return (
    <HomeCard
      title={t('dashboard.student.gradesLabel')}
      badge={
        scored.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {t('dashboard.student.gradesPublished', { count: scored.length })}
          </span>
        )
      }
    >
      <p className="text-xs text-muted-foreground">
        {!scored.length
          ? t('dashboard.student.noGradesYet')
          : high === low
            ? label(high)
            : t('dashboard.student.gradesRange', { high: label(high), low: label(low) })}
      </p>
    </HomeCard>
  );
}
