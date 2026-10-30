import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { Input } from '../../components/ui/Input.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { DataTable, TableRow, TableCell } from '../../components/ui/DataTable.jsx';
import { SelectField, SelectItem } from '../../components/ui/SelectField.jsx';

export default function AuditPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [tenantId, setTenantId] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data: tenantsData } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.get('/admin/tenants?limit=100').then((r) => r.data),
  });
  const tenants = tenantsData?.tenants ?? [];

  const { data, isLoading, error } = useQuery({
    queryKey: ['audit', tenantId, action, from, to, page],
    queryFn: () => {
      const params = new URLSearchParams({ page });
      if (tenantId) params.set('tenantId', tenantId);
      if (action) params.set('action', action);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      return api.get(`/admin/audit?${params}`).then((r) => r.data);
    },
  });

  const logs = data?.logs ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('nav.audit')} />

      <div className="flex gap-3 flex-wrap items-end">
        <SelectField
          label={t('admin.audit.tenantLabel')}
          value={tenantId}
          onValueChange={(v) => {
            setTenantId(v === 'all' ? '' : v);
            setPage(1);
          }}
          className="w-48"
        >
          <SelectItem value="all">{t('admin.audit.allTenants')}</SelectItem>
          {tenants.map((tn) => (
            <SelectItem key={tn._id} value={tn._id}>
              {tn.name}
            </SelectItem>
          ))}
        </SelectField>
        <Input
          label={t('admin.audit.actionLabel')}
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          placeholder="tenant.suspended"
          className="w-48"
        />
        <Input
          label={t('admin.audit.fromLabel')}
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
        />
        <Input
          label={t('admin.audit.toLabel')}
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {error && <p className="text-destructive">{t('admin.audit.loadFailed')}</p>}

      {!error && (
        <DataTable
          headers={[
            t('admin.tenantDetail.tableAction'),
            t('admin.audit.tableTenant'),
            t('admin.tenantDetail.tableActor'),
            t('admin.tenantDetail.tableTarget'),
            t('admin.tenantDetail.tableAt'),
          ]}
          isLoading={isLoading}
          isEmpty={logs.length === 0}
          emptyMessage={t('admin.audit.noneFound')}
        >
          {logs.map((l) => (
            <TableRow key={l._id} className="bg-card">
              <TableCell className="px-4 py-3 font-mono text-xs">{l.action}</TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">
                {tenants.find((tn) => tn._id === l.tenantId)?.name || l.tenantId || '—'}
              </TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">{l.actorId}</TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">
                {l.target?.model ?? '—'}
              </TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">
                {new Date(l.at).toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      )}

      {data && data.pages > 1 && (
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            {t('admin.audit.previous')}
          </Button>
          <span className="text-sm self-center text-muted-foreground">
            {t('admin.audit.pageOfTotal', { page, total: data.pages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= data.pages}
          >
            {t('admin.audit.next')}
          </Button>
        </div>
      )}
    </div>
  );
}
