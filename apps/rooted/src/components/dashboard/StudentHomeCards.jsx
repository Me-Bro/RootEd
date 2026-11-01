import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../ui/Card.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Progress } from '../ui/progress.jsx';
import { RecordListItem } from '../ui/RecordList.jsx';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../ui/sheet.jsx';
import { Skeleton } from '../ui/skeleton.jsx';
import { formatCurrency, formatDate } from '../../utils/intl.js';
import {
  absentRun,
  currentAndNext,
  daysUntil,
  latestGrades,
  monthSummary,
  nextClassDay,
  periodEnded,
  subjectGrades,
  todayPeriods,
} from '../../utils/studentHome.js';

// Shown as a warning once a student has missed this many school days in a row.
const ABSENT_RUN_ALERT = 3;
// The fee card warns once the nearest due date is this close.
const FEE_DUE_SOON_DAYS = 14;
const LATEST_GRADES_SHOWN = 3;

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

function Block({ title, description, action, footer, children }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent>{children}</CardContent>
      {footer && <CardFooter>{footer}</CardFooter>}
    </Card>
  );
}

function LoadingRows({ rows = 3 }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className={i % 2 ? 'h-3.5 w-3/5' : 'h-3.5 w-3/4'} />
          <Skeleton className="h-3 w-2/5" />
        </div>
      ))}
    </div>
  );
}

const shortDate = (date) => formatDate(date, 'en-IN', { day: 'numeric', month: 'short' });
const assessmentName = (g) => (g.assessmentType ?? 'final').replace('_', ' ');

function Marks({ grade }) {
  return (
    <span className="font-semibold whitespace-nowrap">
      {grade.score}
      <span className="text-muted-foreground"> / 100</span>
    </span>
  );
}

export function NowNextCard({ timetable, now }) {
  const { t } = useTranslation();
  if (!timetable) return null;
  if (!timetable.length) {
    return (
      <HomeCard title={t('dashboard.student.todayLabel')}>
        <p className="text-sm text-muted-foreground">{t('dashboard.student.noTimetable')}</p>
      </HomeCard>
    );
  }

  const { current, next, minutesLeft, minutesToNext, hasClassesToday } = currentAndNext(
    timetable,
    now
  );
  const period = current ?? next;
  const nameOf = (e) => e.subjectId?.name ?? '—';

  if (!period) {
    const nextDay = nextClassDay(timetable, now);
    return (
      <HomeCard title={t('dashboard.student.todayLabel')}>
        <p className="text-sm text-muted-foreground">
          {hasClassesToday
            ? t('dashboard.student.noMoreClasses')
            : t('dashboard.student.noClassesToday')}
        </p>
        {nextDay && (
          <p className="text-xs text-muted-foreground">
            {t('dashboard.student.nextClassesOn', {
              day: formatDate(nextDay, 'en-IN', { weekday: 'long' }),
            })}
          </p>
        )}
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

// The student's whole day, current or next period first. A subject with published grades opens
// its results; one without stays plain, so a tap never leads nowhere.
export function ScheduleCard({ timetable, now, gradedSubjects, onOpenSubject }) {
  const { t } = useTranslation();
  const title = t('dashboard.student.scheduleTitle');
  if (!timetable) {
    return (
      <Block title={title}>
        <LoadingRows />
      </Block>
    );
  }

  const periods = todayPeriods(timetable, now);
  if (!periods.length) {
    const nextDay = nextClassDay(timetable, now);
    return (
      <Block title={title}>
        <EmptyState
          className="py-6"
          title={t(
            timetable.length ? 'dashboard.student.noClassesToday' : 'dashboard.student.noTimetable'
          )}
          description={
            nextDay
              ? t('dashboard.student.nextClassesOn', {
                  day: formatDate(nextDay, 'en-IN', { weekday: 'long' }),
                })
              : undefined
          }
        />
      </Block>
    );
  }

  const { current, next, minutesLeft } = currentAndNext(timetable, now);
  const focus = current ?? next;
  const ordered = focus ? [focus, ...periods.filter((p) => p !== focus)] : periods;
  const opener = (p) => {
    const id = p.subjectId?._id;
    return id && gradedSubjects.has(String(id))
      ? () => onOpenSubject({ id, name: p.subjectId.name })
      : undefined;
  };
  const day = formatDate(now, 'en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Block
      title={title}
      description={periods.some(opener) ? `${day} · ${t('dashboard.student.scheduleHint')}` : day}
    >
      <ul className="flex flex-col gap-2">
        {ordered.map((p) => (
          <RecordListItem
            key={p._id ?? p.periodNumber}
            title={p.subjectId?.name ?? '—'}
            meta={p.room}
            onClick={opener(p)}
            className={p === focus ? 'ring-2 ring-primary' : undefined}
            trailing={
              <div className="flex flex-col items-end gap-1">
                {p === focus && (
                  <Badge>
                    {current ? t('dashboard.student.nowLabel') : t('dashboard.student.nextBadge')}
                  </Badge>
                )}
                {periodEnded(p, now) && (
                  <Badge variant="secondary">{t('dashboard.student.done')}</Badge>
                )}
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  {p.startTime}–{p.endTime}
                </span>
              </div>
            }
            footer={
              p === current ? (
                <span className="text-xs font-medium">
                  {t('dashboard.student.endsIn', { count: minutesLeft })}
                </span>
              ) : undefined
            }
          />
        ))}
      </ul>
    </Block>
  );
}

export function AttendanceCard({ records, now, loading }) {
  const { t } = useTranslation();
  const title = t('dashboard.student.attendanceLabel');
  if (loading) {
    return (
      <Block title={title}>
        <LoadingRows rows={2} />
      </Block>
    );
  }

  const month = formatDate(now, 'en-IN', { month: 'long' });
  const m = monthSummary(records, now);
  if (!m.days) {
    return (
      <Block title={title} description={month}>
        <EmptyState
          className="py-6"
          title={t('dashboard.student.noAttendanceTitle')}
          description={t('dashboard.student.noAttendanceBody')}
        />
      </Block>
    );
  }

  const run = absentRun(records);
  const dates = [
    m.absent > 0 &&
      t('dashboard.student.absentOn', { dates: m.absentDates.map(shortDate).join(', ') }),
    m.late > 0 && t('dashboard.student.lateOn', { dates: m.lateDates.map(shortDate).join(', ') }),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Block
      title={title}
      description={t('dashboard.student.attendanceMonth', { month, count: m.days })}
      action={
        run >= ABSENT_RUN_ALERT && (
          <Badge variant="danger">{t('dashboard.student.absentRun', { count: run })}</Badge>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold">{m.pct}%</span>
          <span className="text-xs text-muted-foreground">
            {t('dashboard.student.presentOrLate')}
          </span>
        </div>
        <Progress value={m.pct} aria-label={title} />
        <div className="grid grid-cols-3 gap-2">
          {[
            ['present', 'success'],
            ['late', 'warning'],
            ['absent', 'danger'],
          ].map(([status, variant]) => (
            <div
              key={status}
              className="flex flex-col items-center gap-1 rounded-lg border border-border py-2"
            >
              <span className="text-xl font-semibold">{m[status]}</span>
              <Badge variant={variant}>{t(`dashboard.student.status.${status}`)}</Badge>
            </div>
          ))}
        </div>
        {dates && <p className="text-xs text-muted-foreground">{dates}</p>}
      </div>
    </Block>
  );
}

export function GradesCard({ grades, loading, onOpenSubject }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const title = t('dashboard.student.latestGrades');
  if (loading) {
    return (
      <Block title={title}>
        <LoadingRows />
      </Block>
    );
  }

  const latest = latestGrades(grades);
  if (!latest.length) {
    return (
      <Block title={title}>
        <EmptyState
          className="py-6"
          title={t('dashboard.student.noResultsTitle')}
          description={t('dashboard.student.noResultsBody')}
        />
      </Block>
    );
  }

  return (
    <Block
      title={title}
      footer={
        latest.length > LATEST_GRADES_SHOWN ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => navigate('/me/grades')}
          >
            {t('dashboard.student.allResults', { count: latest.length })}
          </Button>
        ) : undefined
      }
    >
      <ul className="flex flex-col gap-2">
        {latest.slice(0, LATEST_GRADES_SHOWN).map((g) => (
          <RecordListItem
            key={g._id}
            title={g.subject?.name ?? '—'}
            meta={
              <>
                <span className="capitalize">{assessmentName(g)}</span>
                {g.publishedAt && ` · ${shortDate(g.publishedAt)}`}
              </>
            }
            trailing={<Marks grade={g} />}
            onClick={() => onOpenSubject({ id: g.subjectId, name: g.subject?.name ?? '—' })}
          />
        ))}
      </ul>
    </Block>
  );
}

export function FeeCard({ fees, now, loading }) {
  const { t } = useTranslation();
  const title = t('dashboard.student.feeBalanceLabel');
  if (loading) {
    return (
      <Block title={title}>
        <LoadingRows rows={1} />
      </Block>
    );
  }

  const assignments = fees?.assignments ?? [];
  const payments = fees?.payments ?? [];
  const due = assignments.reduce((sum, a) => sum + a.totalAmount - (a.discountAmount || 0), 0);
  const balance = due - payments.reduce((sum, p) => sum + p.amount, 0);
  const open = assignments.filter((a) => a.status === 'unpaid' || a.status === 'partial');
  const dueDates = open
    .map((a) => a.dueDate)
    .filter(Boolean)
    .sort();
  const overdue = dueDates.length > 0 && new Date(dueDates[0]) < now;
  const daysLeft = dueDates.length > 0 ? daysUntil(dueDates[0], now) : null;

  let badge = <Badge variant="success">{t('dashboard.student.feePaidUp')}</Badge>;
  if (balance > 0) {
    badge = overdue ? (
      <Badge variant="danger">{t('dashboard.student.feeOverdue')}</Badge>
    ) : (
      daysLeft !== null &&
      daysLeft <= FEE_DUE_SOON_DAYS && (
        <Badge variant="warning">{t('dashboard.student.dueIn', { count: daysLeft })}</Badge>
      )
    );
  }

  return (
    <Block title={title} action={badge}>
      <div className="flex flex-col gap-1">
        <span className="text-3xl font-semibold">{formatCurrency(balance)}</span>
        {balance > 0 && open.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {[
              t('dashboard.student.feeUnpaid', { count: open.length }),
              dueDates[0] && t('dashboard.student.feeDueOn', { date: formatDate(dueDates[0]) }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
        {balance > 0 && !payments.length && (
          <span className="text-xs text-muted-foreground">
            {t('dashboard.student.feeNoPayments')}
          </span>
        )}
      </div>
    </Block>
  );
}

// One subject's published results, opened from a schedule row or a grade row.
export function SubjectSheet({ subject, grades, onClose }) {
  const { t } = useTranslation();
  const rows = subject ? subjectGrades(grades, subject.id) : [];
  return (
    <Sheet open={Boolean(subject)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{subject?.name}</SheetTitle>
          <SheetDescription>{t('dashboard.student.publishedResults')}</SheetDescription>
        </SheetHeader>
        <ul className="flex flex-col gap-2 px-4">
          {rows.map((g) => (
            <RecordListItem
              key={g._id}
              title={<span className="capitalize">{assessmentName(g)}</span>}
              meta={
                g.publishedAt &&
                t('dashboard.student.publishedOn', { date: shortDate(g.publishedAt) })
              }
              trailing={<Marks grade={g} />}
            />
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
