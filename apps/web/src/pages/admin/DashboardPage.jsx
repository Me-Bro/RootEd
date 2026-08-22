import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { formatDate } from '../../utils/intl.js';
import { useAuth } from '../../contexts/useAuth.js';
import { Card, CardContent } from '../../components/ui/Card.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { DataTable, TableRow, TableCell } from '../../components/ui/DataTable.jsx';

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

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isSuperAdmin = user?.systemRole === 'super_admin';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('dashboard.title')}
        description={isSuperAdmin ? t('dashboard.systemOverview') : t('dashboard.overview')}
      />
      {isSuperAdmin ? <SuperAdminDashboard /> : <TenantDashboard />}
    </div>
  );
}
