import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';

const EMPTY_FILTERS = { tenantId: '', module: '', ip: '', userEmail: '', statusCode: '' };

function statusVariant(statusCode) {
  if (statusCode >= 500) return 'danger';
  if (statusCode >= 400) return 'warning';
  return 'success';
}

export default function RequestLogsPage() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ['request-logs', appliedFilters, page],
    queryFn: () =>
      api
        .get('/admin/request-logs', { params: { ...appliedFilters, page, limit: 50 } })
        .then((r) => r.data),
  });

  function update(field) {
    return (e) => setFilters((f) => ({ ...f, [field]: e.target.value }));
  }

  function applyFilters(e) {
    e.preventDefault();
    setPage(1);
    setAppliedFilters(filters);
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('nav.requestLogs')} />

      <form onSubmit={applyFilters} className="flex flex-wrap items-end gap-3">
        <Input
          label={t('admin.requestLogs.filterTenantId')}
          value={filters.tenantId}
          onChange={update('tenantId')}
        />
        <Input
          label={t('admin.requestLogs.filterModule')}
          value={filters.module}
          onChange={update('module')}
        />
        <Input label={t('admin.requestLogs.filterIp')} value={filters.ip} onChange={update('ip')} />
        <Input
          label={t('admin.requestLogs.filterUser')}
          value={filters.userEmail}
          onChange={update('userEmail')}
        />
        <Input
          label={t('admin.requestLogs.filterStatus')}
          value={filters.statusCode}
          onChange={update('statusCode')}
        />
        <Button type="submit">{t('admin.requestLogs.applyFilters')}</Button>
        <Button type="button" variant="outline" onClick={clearFilters}>
          {t('admin.requestLogs.clearFilters')}
        </Button>
      </form>

      {isLoading && <p className="text-gray-500">{t('common.loading')}</p>}
      {error && <p className="text-red-500">{t('admin.requestLogs.loadFailed')}</p>}

      {data && (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-left">
                <tr>
                  {[
                    t('admin.requestLogs.tableTenant'),
                    t('admin.requestLogs.tableModule'),
                    t('admin.requestLogs.tableMethod'),
                    t('admin.requestLogs.tablePath'),
                    t('admin.requestLogs.tableStatus'),
                    t('admin.requestLogs.tableDuration'),
                    t('admin.requestLogs.tableIp'),
                    t('admin.requestLogs.tableUser'),
                    t('admin.requestLogs.tableAt'),
                  ].map((h) => (
                    <th key={h} className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {data.logs?.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-gray-500">
                      {t('admin.requestLogs.noEntries')}
                    </td>
                  </tr>
                )}
                {data.logs?.map((log) => (
                  <tr
                    key={log._id}
                    className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <td className="px-4 py-3 text-gray-500">{log.tenantSubdomain ?? '—'}</td>
                    <td className="px-4 py-3">{log.module ?? '—'}</td>
                    <td className="px-4 py-3">{log.method}</td>
                    <td className="px-4 py-3 font-mono text-xs">{log.path}</td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(log.statusCode)}>{log.statusCode}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{log.durationMs} ms</td>
                    <td className="px-4 py-3 text-gray-500">{log.ip ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{log.userEmail ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(log.at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">
              {t('admin.requestLogs.pageOf', { page: data.page, pages: data.pages || 1 })}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t('admin.requestLogs.previous')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('admin.requestLogs.next')}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
