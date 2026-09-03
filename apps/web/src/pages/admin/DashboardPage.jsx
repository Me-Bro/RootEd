import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api.js';
import { formatDate } from '../../utils/intl.js';
import { useAuth } from '../../contexts/useAuth.js';
import { Card, CardContent } from '../../components/ui/Card.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { DataTable, TableRow, TableCell } from '../../components/ui/DataTable.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Button } from '../../components/ui/Button.jsx';
import AttentionStrip from '../../components/dashboard/AttentionStrip.jsx';
import KpiCard from '../../components/dashboard/KpiCard.jsx';
import TrendChart from '../../components/dashboard/TrendChart.jsx';

function StatCard({ label, value }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-bold text-foreground">{value ?? '—'}</p>
      </CardContent>
    </Card>
  );
}

function useTenantsCount(status, enabled) {
  return useQuery({
    queryKey: ['tenants', 'count', status],
    queryFn: async () => {
      const params = { limit: 1 };
      if (status) params.status = status;
      const { data } = await api.get('/admin/tenants', { params });
      return data.total ?? 0;
    },
    enabled,
  });
}

function useRecentAudit(enabled) {
  return useQuery({
    queryKey: ['admin', 'audit', 'recent'],
    queryFn: async () => {
      const { data } = await api.get('/admin/audit', { params: { limit: 10 } });
      return data.logs ?? [];
    },
    enabled,
  });
}

function SuperAdminDashboard() {
  const { t } = useTranslation();
  const { data: totalTenants, isLoading: loadingTotal } = useTenantsCount(null, true);
  const { data: activeTenants, isLoading: loadingActive } = useTenantsCount('active', true);
  const { data: suspendedTenants, isLoading: loadingSuspended } = useTenantsCount(
    'suspended',
    true
  );
  const { data: archivedTenants, isLoading: loadingArchived } = useTenantsCount('archived', true);
  const { data: auditLogs, isLoading: loadingAudit } = useRecentAudit(true);

  const isLoading = loadingTotal || loadingActive || loadingSuspended || loadingArchived;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('dashboard.totalTenants')} value={isLoading ? '…' : totalTenants} />
        <StatCard
          label={t('dashboard.activeTenants')}
          value={loadingActive ? '…' : activeTenants}
        />
        <StatCard
          label={t('dashboard.suspended')}
          value={loadingSuspended ? '…' : suspendedTenants}
        />
        <StatCard label={t('dashboard.archived')} value={loadingArchived ? '…' : archivedTenants} />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-foreground">{t('dashboard.recentActivity')}</h2>
        <DataTable
          headers={[
            t('dashboard.columnAction'),
            t('dashboard.columnActor'),
            t('dashboard.columnIp'),
            t('dashboard.columnTime'),
          ]}
          isLoading={loadingAudit}
          isEmpty={!auditLogs?.length}
          emptyMessage={t('dashboard.noAuditEntries')}
        >
          {auditLogs?.map((log) => (
            <TableRow key={log._id}>
              <TableCell className="font-mono text-xs text-foreground">{log.action}</TableCell>
              <TableCell className="text-muted-foreground truncate max-w-[120px]">
                {log.actorId ?? '—'}
              </TableCell>
              <TableCell className="text-muted-foreground">{log.ip ?? '—'}</TableCell>
              <TableCell className="text-muted-foreground">
                {log.at
                  ? formatDate(log.at, 'en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—'}
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      </div>
    </>
  );
}

function TenantDashboard() {
  const { t } = useTranslation();
  const { data: tenant, isLoading } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => api.get('/tenant/settings').then((r) => r.data),
  });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label={t('dashboard.school')} value={isLoading ? '…' : tenant?.name} />
      <StatCard label={t('dashboard.plan')} value={isLoading ? '…' : tenant?.plan} />
      <StatCard label={t('common.status')} value={isLoading ? '…' : tenant?.status} />
      <StatCard label={t('dashboard.timezone')} value={isLoading ? '…' : tenant?.timezone} />
    </div>
  );
}

// A principal (or anyone else holding all 4 read permissions — tenant_admin
// included) sees the school-wide rollup below instead of the 4 metadata
// cards. Everyone else keeps seeing TenantDashboard, unchanged.
const SCHOOL_WIDE_PERMISSIONS = ['attendance:read', 'fees:read', 'leave:read', 'grades:read'];

function hasSchoolWideVisibility(user) {
  const permissions = user?.permissions ?? [];
  return SCHOOL_WIDE_PERMISSIONS.every((p) => permissions.includes(p));
}

function todayParam() {
  return new Date().toISOString().slice(0, 10);
}

function pct(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function tone(value, { good = 75, warn = 50 } = {}) {
  if (value === null || value === undefined) return 'warn';
  if (value >= good) return 'good';
  if (value >= warn) return 'warn';
  return 'bad';
}

function PrincipalDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(todayParam());
  const [period, setPeriod] = useState('7d');
  const isToday = selectedDate === todayParam();

  const { data: tenant } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => api.get('/tenant/settings').then((r) => r.data),
  });

  // Self-lookup, no permission required — but a tenant_admin (who also
  // qualifies for this view) may have no linked StaffMember at all, so a 404
  // here is expected, not an error: fall back to a name-less greeting.
  const { data: staffMe } = useQuery({
    queryKey: ['staff', 'members', 'me'],
    queryFn: () => api.get('/staff/members/me').then((r) => r.data),
    retry: false,
    throwOnError: false,
  });

  const { data: totalStudents = 0 } = useQuery({
    queryKey: ['academic', 'students', 'count'],
    queryFn: () =>
      api
        .get('/academic/students', { params: { limit: 1, status: 'active' } })
        .then((r) => r.data.total ?? 0),
  });

  const { data: studentAttendance = [] } = useQuery({
    queryKey: ['academic', 'attendance', selectedDate, 'student'],
    queryFn: () =>
      api
        .get('/academic/attendance', { params: { date: selectedDate, entityType: 'student' } })
        .then((r) => r.data),
  });

  const { data: staffAttendance = [] } = useQuery({
    queryKey: ['staff', 'attendance', selectedDate],
    queryFn: () =>
      api.get('/staff/attendance', { params: { date: selectedDate } }).then((r) => r.data),
  });

  const { data: pendingLeave } = useQuery({
    queryKey: ['staff', 'leave-requests', 'pending-summary'],
    queryFn: async () => {
      const { data } = await api.get('/staff/leave-requests', {
        params: { status: 'pending', limit: 100 },
      });
      // Oldest by fromDate (not createdAt — that's what "how long has this
      // been waiting" means to a principal), scanned client-side since the
      // route doesn't support that sort order and a school's pending queue
      // is small enough that fetching up to 100 is cheap.
      const oldest = (data.requests ?? []).reduce(
        (min, r) => (!min || new Date(r.fromDate) < new Date(min) ? r.fromDate : min),
        null
      );
      return { total: data.total ?? 0, oldest };
    },
  });

  const { data: feeSummary } = useQuery({
    queryKey: ['fee', 'collection-summary'],
    queryFn: () => api.get('/fee/collection-summary').then((r) => r.data),
  });

  const { data: gradesSummary } = useQuery({
    queryKey: ['academic', 'grades', 'summary'],
    queryFn: () => api.get('/academic/grades/summary').then((r) => r.data),
  });

  const { data: trend = [] } = useQuery({
    queryKey: ['academic', 'attendance', 'trend', period],
    queryFn: () =>
      api
        .get('/academic/attendance/trend', { params: { days: period === '30d' ? 30 : 7 } })
        .then((r) => r.data),
    enabled: period !== 'year',
  });

  const presentCount = studentAttendance.filter((r) =>
    ['present', 'late'].includes(r.status)
  ).length;
  const absentCount = studentAttendance.filter((r) => r.status === 'absent').length;
  const attendancePct = pct(presentCount, studentAttendance.length);

  const staffPresentCount = staffAttendance.filter((r) =>
    ['present', 'late'].includes(r.status)
  ).length;
  const staffPct = pct(staffPresentCount, staffAttendance.length);

  const attentionItems = [
    {
      key: 'defaulters',
      count: feeSummary?.defaulterCount ?? 0,
      tone: 'bad',
      labelKey: 'dashboard.principal.defaultersLabel',
      meta: feeSummary
        ? t('dashboard.principal.defaultersMeta', {
            amount: feeSummary.overdueTotal.toLocaleString('en-IN'),
          })
        : undefined,
      onTap: () => navigate('/dashboard/finance'),
    },
    {
      key: 'pendingLeave',
      count: pendingLeave?.total ?? 0,
      tone: 'warn',
      labelKey: 'dashboard.principal.pendingLeaveLabel',
      meta: pendingLeave?.oldest
        ? t('dashboard.principal.pendingLeaveMeta', {
            date: formatDate(pendingLeave.oldest, 'en-IN', { day: '2-digit', month: 'short' }),
          })
        : undefined,
      onTap: () => navigate('/dashboard/staff'),
    },
    {
      key: 'absentToday',
      count: isToday ? absentCount : 0,
      tone: 'warn',
      labelKey: 'dashboard.principal.absentTodayLabel',
      meta: t('dashboard.principal.absentTodayMeta', { total: totalStudents }),
      onTap: () => navigate('/dashboard/academic'),
    },
  ];

  const trendPoints =
    period === '30d'
      ? trend.map((p, i) => ({ label: `W${i + 1}`, pct: p.presentPct }))
      : trend.map((p) => ({ label: String(new Date(p.date).getDate()), pct: p.presentPct }));
  const trendPcts = trend.map((p) => p.presentPct).filter((v) => v !== null);
  const trendHeadline =
    period === '30d'
      ? trendPcts.length
        ? `${Math.round((trendPcts.reduce((a, b) => a + b, 0) / trendPcts.length) * 10) / 10}%`
        : '—'
      : attendancePct !== null
        ? `${attendancePct}%`
        : '—';
  const trendSubline =
    period === '30d'
      ? t('dashboard.principal.trendRangeWeekly', { days: trend.length * 5 })
      : trendPcts.length
        ? t('dashboard.principal.trendRangeToday', {
            min: Math.min(...trendPcts),
            max: Math.max(...trendPcts),
          })
        : '';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {t('dashboard.principal.greeting', { name: staffMe?.firstName ?? tenant?.name ?? '' })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('dashboard.principal.subtitle', {
              school: tenant?.name ?? '',
              date: formatDate(selectedDate, 'en-IN', {
                weekday: 'short',
                day: '2-digit',
                month: 'short',
              }),
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={selectedDate}
            max={todayParam()}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-auto"
          />
          {!isToday && (
            <Button variant="outline" size="sm" onClick={() => setSelectedDate(todayParam())}>
              {t('dashboard.principal.backToToday')}
            </Button>
          )}
        </div>
      </div>

      {!isToday && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
          {t('dashboard.principal.viewingPastDay')} — {t('dashboard.principal.liveQueueNote')}
        </div>
      )}

      <AttentionStrip items={attentionItems} />

      <div>
        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          {t('dashboard.principal.keyNumbers')}
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label={t(
              isToday ? 'dashboard.principal.attendanceToday' : 'dashboard.principal.attendanceOn'
            )}
            valueLabel={attendancePct !== null ? `${attendancePct}%` : '—'}
            percent={attendancePct ?? 0}
            tone={tone(attendancePct)}
            onTap={() => navigate('/dashboard/academic')}
          />
          <KpiCard
            label={t('dashboard.principal.feeCollected')}
            valueLabel={feeSummary?.collectedPct != null ? `${feeSummary.collectedPct}%` : '—'}
            percent={feeSummary?.collectedPct ?? 0}
            tone={tone(feeSummary?.collectedPct)}
            onTap={() => navigate('/dashboard/finance')}
          />
          <KpiCard
            label={t('dashboard.principal.avgScore')}
            valueLabel={
              gradesSummary?.classAverageScore != null ? `${gradesSummary.classAverageScore}%` : '—'
            }
            percent={gradesSummary?.classAverageScore ?? 0}
            tone={tone(gradesSummary?.classAverageScore)}
            onTap={() => navigate('/dashboard/academic')}
          />
          <KpiCard
            label={t('dashboard.principal.staffPresent')}
            valueLabel={staffPct !== null ? `${staffPct}%` : '—'}
            percent={staffPct ?? 0}
            tone={tone(staffPct)}
            onTap={() => navigate('/dashboard/staff')}
          />
        </div>
      </div>

      <TrendChart
        period={period}
        onPeriodChange={setPeriod}
        points={trendPoints}
        headline={trendHeadline}
        subline={trendSubline}
        notEnoughHistory={period === 'year'}
      />
    </div>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isSuperAdmin = user?.systemRole === 'super_admin';
  const isPrincipalView = !isSuperAdmin && hasSchoolWideVisibility(user);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('dashboard.title')}
        description={isSuperAdmin ? t('dashboard.systemOverview') : t('dashboard.overview')}
      />
      {isSuperAdmin ? (
        <SuperAdminDashboard />
      ) : isPrincipalView ? (
        <PrincipalDashboard />
      ) : (
        <TenantDashboard />
      )}
    </div>
  );
}
