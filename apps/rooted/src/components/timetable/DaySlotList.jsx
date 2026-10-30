import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils.js';
import { Badge } from '../ui/Badge.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';

/**
 * Vertical list of a single day's periods — the mobile-approved replacement
 * for the 8x5 grid (docs/mobile-ui/07-timetable-approved.html). Full subject
 * + teacher names always visible, never truncated. Read-only: editing stays
 * grid-only per the approved spec's scope.
 */
export function DaySlotList({ slots, activeDay, isNowFn }) {
  const { t } = useTranslation();
  if (slots.length === 0) {
    return (
      <EmptyState
        title={t('academic.timetable.noClassesScheduled')}
        description={t('academic.timetable.noPeriodsScheduledDescription')}
      />
    );
  }

  return (
    <ul
      className="flex flex-col gap-2"
      aria-label={t('academic.timetable.periodsAriaLabel')}
      data-day={activeDay}
    >
      {slots.map((slot) => {
        const now = isNowFn(slot);
        return (
          <li
            key={slot._id}
            className={cn(
              'flex items-start gap-3 rounded-lg border p-3',
              now ? 'border-primary bg-primary/5' : 'border-border'
            )}
          >
            <div className="w-14 shrink-0 text-xs leading-tight text-muted-foreground">
              <div>{slot.startTime}</div>
              <div>{slot.endTime}</div>
            </div>
            <div className="min-w-0 grow">
              <p className="text-sm font-medium">{slot.subjectId?.name || '—'}</p>
              <p className="text-xs text-muted-foreground">
                {slot.teacher ? `${slot.teacher.firstName} ${slot.teacher.lastName}` : '—'}
                {slot.room ? ` · ${slot.room}` : ''}
              </p>
            </div>
            {now ? (
              <Badge variant="success">{t('academic.timetable.now')}</Badge>
            ) : (
              <span className="shrink-0 text-xs text-muted-foreground">P{slot.periodNumber}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
