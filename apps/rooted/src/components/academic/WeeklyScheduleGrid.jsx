import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isTodayColumn, isCurrentPeriodCell } from '../../utils/scheduleHighlight.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];
const DAY_TO_NUMBER = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5 };

// AttendancePage is a daily roll by design (see docs/mobile-ui/03-attendance-approved.html)
// — it reads sectionId only, so passing the period's subjectId just produced a
// param the destination silently dropped.
function attendanceLink(entry) {
  const sectionId = entry.sectionId?._id ?? entry.sectionId;
  return `/academic/attendance?sectionId=${sectionId}`;
}

function ScheduleCell({ day, entry, isCurrent, now, linkToAttendance }) {
  const { t } = useTranslation();
  if (!entry) return <span className="text-xs text-muted-foreground">—</span>;

  const body = (
    <div>
      <p className="font-medium text-xs">
        {entry.sectionId?.name || '—'} · {entry.subjectId?.name || '—'}
      </p>
      <p className="text-xs text-muted-foreground">
        {entry.startTime}–{entry.endTime}
        {entry.room ? ` · ${entry.room}` : ''}
      </p>
    </div>
  );

  if (!linkToAttendance || !isTodayColumn(day, now)) return body;

  return (
    <Link
      to={attendanceLink(entry)}
      className={`block rounded ${isCurrent ? 'ring-2 ring-primary' : ''}`}
      title={t('academic.mySchedule.takeAttendanceTooltip')}
    >
      {body}
    </Link>
  );
}

/**
 * Renders a Mon-Fri x period-1-8 weekly schedule (stacked cards on mobile, a
 * grid on desktop). Shared by the teacher's own-schedule page and the
 * student self-service timetable page — they differ only in where entries
 * come from and whether a cell should deep-link to taking attendance.
 */
export default function WeeklyScheduleGrid({ entries, now, linkToAttendance = false }) {
  const { t } = useTranslation();

  function cellEntry(day, period) {
    return entries.find((e) => e.dayOfWeek === DAY_TO_NUMBER[day] && e.periodNumber === period);
  }

  return (
    <>
      {/* Mobile: stacked day cards */}
      <div className="flex flex-col gap-4 md:hidden">
        {DAYS.map((day) => {
          const dayEntries = PERIODS.map((period) => ({
            period,
            entry: cellEntry(day, period),
          })).filter((p) => p.entry);
          const today = isTodayColumn(day, now);

          return (
            <div
              key={day}
              className={`rounded-lg border border-border p-3 ${today ? 'border-primary' : ''}`}
            >
              <p className="font-medium text-sm mb-2">
                {t(`common.weekdays.${day.toLowerCase()}`)}
                {today ? t('academic.mySchedule.todaySuffix') : ''}
              </p>
              {dayEntries.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t('academic.mySchedule.noClasses')}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {dayEntries.map(({ period, entry }) => (
                    <div key={period} className="flex items-start gap-2 text-sm">
                      <span className="text-xs text-muted-foreground w-14 shrink-0">
                        {t('academic.mySchedule.periodNumber', { period })}
                      </span>
                      <ScheduleCell
                        day={day}
                        entry={entry}
                        isCurrent={isCurrentPeriodCell(day, entry, now)}
                        now={now}
                        linkToAttendance={linkToAttendance}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop: grid */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground w-16">
                {t('academic.timetable.period')}
              </th>
              {DAYS.map((d) => (
                <th
                  key={d}
                  className={`px-4 py-3 text-left font-medium ${
                    isTodayColumn(d, now)
                      ? 'text-foreground bg-primary/10'
                      : 'text-muted-foreground'
                  }`}
                >
                  {t(`common.weekdays.${d.toLowerCase()}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {PERIODS.map((period) => (
              <tr key={period} className="bg-card">
                <td className="px-4 py-3 font-medium text-muted-foreground">{period}</td>
                {DAYS.map((day) => {
                  const entry = cellEntry(day, period);
                  const current = isCurrentPeriodCell(day, entry, now);
                  return (
                    <td
                      key={day}
                      className={`px-4 py-3 border-l border-border ${current ? 'bg-primary/10' : ''}`}
                    >
                      <ScheduleCell
                        day={day}
                        entry={entry}
                        isCurrent={current}
                        now={now}
                        linkToAttendance={linkToAttendance}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
