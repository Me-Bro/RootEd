import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { useAuth } from '../../contexts/useAuth.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { DataTable, TableRow, TableCell } from '../../components/ui/DataTable.jsx';
import { formatCurrency, formatDate } from '../../utils/intl.js';
import {
  daysAgoString,
  localDayString,
  localMonthString,
  splitMinutes,
} from '../../utils/studyCenter.js';

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
  const { user } = useAuth();
  const canSeeSales = (user?.permissions ?? []).includes('fees:read');
  const duration = useDuration();

  const [month, setMonth] = useState(localMonthString());
  const [day, setDay] = useState(localDayString());
  const [from, setFrom] = useState(daysAgoString(29));
  const [to, setTo] = useState(localDayString());

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
  const sales = useQuery({
    queryKey: ['report', 'sales', from, to],
    queryFn: () =>
      api.get('/fee/reports/day-pass-sales', { params: { from, to } }).then((r) => r.data),
    enabled: canSeeSales && Boolean(from) && Boolean(to) && to >= from,
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
              <Stat
                testId="stat-pool"
                label={t('studyCenter.reports.dayPassPool')}
                value={`${o.poolFree} / ${o.poolSeats}`}
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
              <TableCell className="font-medium">
                {l.name}
                {l.kind === 'walk_in' && (
                  <Badge variant="secondary" className="ml-2">
                    {t('studyCenter.sell.walkIn')}
                  </Badge>
                )}
              </TableCell>
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

      {canSeeSales && (
        <section className="flex flex-col gap-3" aria-labelledby="rep-sales">
          <h2 id="rep-sales" className="text-sm font-semibold">
            {t('studyCenter.reports.sales')}
          </h2>
          <div className="grid max-w-md grid-cols-2 gap-3">
            <Input
              id="report-from"
              type="date"
              label={t('studyCenter.reports.from')}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <Input
              id="report-to"
              type="date"
              label={t('studyCenter.reports.to')}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <DataTable
            headers={[
              t('studyCenter.reports.day'),
              t('studyCenter.reports.passesSold'),
              t('studyCenter.reports.revenue'),
            ]}
            isLoading={sales.isLoading}
            isEmpty={!sales.isLoading && (sales.data?.days ?? []).length === 0}
            emptyMessage={t('studyCenter.reports.noSales')}
          >
            {(sales.data?.days ?? []).map((d) => (
              <TableRow key={d.day}>
                <TableCell className="font-medium">{formatDate(d.day)}</TableCell>
                <TableCell>{d.count}</TableCell>
                <TableCell>{formatCurrency(d.revenue)}</TableCell>
              </TableRow>
            ))}
          </DataTable>
          {sales.data && sales.data.totalCount > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="sales-total">
              {t('studyCenter.reports.salesTotal', {
                count: sales.data.totalCount,
                amount: formatCurrency(sales.data.totalRevenue),
              })}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
