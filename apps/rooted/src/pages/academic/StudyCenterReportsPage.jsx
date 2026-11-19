import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { DataTable, TableRow, TableCell } from '../../components/ui/DataTable.jsx';
import { formatDate } from '../../utils/intl.js';
import { localDayString, localMonthString, splitMinutes } from '../../utils/studyCenter.js';

function Stat({ label, value, testId }) {
  return (
    <div className="rounded-lg border border-border p-3" data-testid={testId}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

function useDuration() {
  const { t } = useTranslation();
  return (minutes) => {
    const { hours, minutes: m } = splitMinutes(minutes);
    if (hours && m) return t('studyCenter.reports.hoursMinutes', { hours, minutes: m });
    if (hours) return t('studyCenter.reports.hoursOnly', { hours });
    return t('studyCenter.reports.minutesOnly', { minutes: m });
  };
}

// The owner's four reads. Everything is computed on the server on the centre's own
// calendar; the dates here only choose what to look at.
export default function StudyCenterReportsPage() {
  const { t } = useTranslation();
  const duration = useDuration();

  const [month, setMonth] = useState(localMonthString());
  const [day, setDay] = useState(localDayString());

  const occupancy = useQuery({
    queryKey: ['report', 'occupancy'],
    queryFn: () => api.get('/academic/visits/reports/occupancy').then((r) => r.data),
    refetchInterval: 60_000,
  });
  const hours = useQuery({
    queryKey: ['report', 'hours', month],
    queryFn: () =>
      api.get('/academic/visits/reports/hours', { params: { month } }).then((r) => r.data),
    enabled: Boolean(month),
  });
  const noShows = useQuery({
    queryKey: ['report', 'no-shows', day],
    queryFn: () =>
      api.get('/academic/visits/reports/no-shows', { params: { date: day } }).then((r) => r.data),
    enabled: Boolean(day),
  });

  const o = occupancy.data;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t('studyCenter.reports.title')}
        description={t('studyCenter.reports.description')}
      />

      <section className="flex flex-col gap-3" aria-labelledby="rep-occupancy">
        <h2 id="rep-occupancy" className="text-sm font-semibold">
          {t('studyCenter.reports.occupancy')}
        </h2>
        {o && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                testId="stat-inside"
                label={t('studyCenter.reports.insideNow')}
                value={`${o.occupiedNow} / ${o.seatsActive}`}
              />
              <Stat
                testId="stat-held"
                label={t('studyCenter.reports.heldByMembers')}
                value={o.held}
              />
            </div>
            <DataTable
              headers={[
                t('studyCenter.seatMap.shift'),
                t('studyCenter.reports.seatsHeld'),
                t('studyCenter.reports.insideNow'),
              ]}
              isEmpty={o.shifts.length === 0}
              emptyMessage={t('studyCenter.reports.noShifts')}
            >
              {o.shifts.map((s) => (
                <TableRow key={s.sectionId}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.heldSeats}</TableCell>
                  <TableCell>{s.checkedInNow}</TableCell>
                </TableRow>
              ))}
            </DataTable>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="rep-hours">
        <h2 id="rep-hours" className="text-sm font-semibold">
          {t('studyCenter.reports.hours')}
        </h2>
        <p className="text-xs text-muted-foreground" data-testid="hours-note">
          {t('studyCenter.reports.hoursNote')}
        </p>
        <div className="max-w-xs">
          <Input
            id="report-month"
            type="month"
            label={t('studyCenter.reports.month')}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        <DataTable
          headers={[
            t('studyCenter.desk.person'),
            t('studyCenter.reports.timeOnSeat'),
            t('studyCenter.reports.visits'),
            t('studyCenter.reports.autoClosed'),
          ]}
          isLoading={hours.isLoading}
          isEmpty={!hours.isLoading && (hours.data?.learners ?? []).length === 0}
          emptyMessage={t('studyCenter.reports.noVisits')}
        >
          {(hours.data?.learners ?? []).map((l) => (
            <TableRow key={l.studentId}>
              <TableCell className="font-medium">{l.name}</TableCell>
              <TableCell>{duration(l.minutes)}</TableCell>
              <TableCell>{l.visits}</TableCell>
              <TableCell>{l.autoClosedVisits}</TableCell>
            </TableRow>
          ))}
        </DataTable>
        {hours.data && hours.data.learners.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t('studyCenter.reports.totalTime', { time: duration(hours.data.totalMinutes) })}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="rep-noshows">
        <h2 id="rep-noshows" className="text-sm font-semibold">
          {t('studyCenter.reports.noShows')}
        </h2>
        <p className="text-xs text-muted-foreground">{t('studyCenter.reports.noShowsHint')}</p>
        <div className="max-w-xs">
          <Input
            id="report-day"
            type="date"
            label={t('studyCenter.reports.day')}
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </div>
        <DataTable
          headers={[
            t('studyCenter.desk.person'),
            t('studyCenter.sell.phone'),
            t('studyCenter.reports.planEnds'),
          ]}
          isLoading={noShows.isLoading}
          isEmpty={!noShows.isLoading && (noShows.data?.noShows ?? []).length === 0}
          emptyMessage={t('studyCenter.reports.noNoShows')}
        >
          {(noShows.data?.noShows ?? []).map((r) => (
            <TableRow key={r.studentId}>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell>{r.phone ?? '—'}</TableCell>
              <TableCell>{formatDate(r.coversTo)}</TableCell>
            </TableRow>
          ))}
        </DataTable>
      </section>
    </div>
  );
}
