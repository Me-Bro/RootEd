import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { formatDateTime, formatNumber } from '../../utils/intl.js';

const EMPTY_FILTERS = { status: '', kind: '', reason: '', to: '' };
const STATUSES = ['sent', 'failed', 'skipped'];
const STATUS_VARIANT = { sent: 'success', failed: 'danger', skipped: 'warning' };
const DAY_RANGES = [7, 30, 90];

// Stats days are IST calendar days as YYYY-MM-DD; reformatting the string avoids
// a timezone shift from round-tripping through Date.
const showDay = (day) => day.split('-').reverse().join('-');

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

export default function EmailLogsPage() {
  const { t } = useTranslation();
  const [days, setDays] = useState(30);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const stats = useQuery({
    queryKey: ['email-log-stats', days],
    queryFn: () => api.get('/admin/email-logs/stats', { params: { days } }).then((r) => r.data),
  });
  const logs = useQuery({
    queryKey: ['email-logs', appliedFilters, page],
    queryFn: () =>
      api
        .get('/admin/email-logs', { params: { ...appliedFilters, page, limit: 50 } })
        .then((r) => r.data),
  });

  const update = (field) => (e) => setFilters((f) => ({ ...f, [field]: e.target.value }));
  const applyFilters = (e) => {
    e.preventDefault();
    setPage(1);
    setAppliedFilters(filters);
  };
  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const s = stats.data;
  // Bars scale to the busiest day, or to the free-tier cap when one is set.
  const barMax = s ? Math.max(s.dailyLimit ?? 0, ...s.daily.map((d) => d.sent + d.failed), 1) : 1;
  const usedPct = s?.dailyLimit ? Math.round((s.today.sent / s.dailyLimit) * 100) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('nav.emailLogs')} />

      {stats.isLoading && <p className="text-gray-500">{t('common.loading')}</p>}
      {stats.error && <p className="text-red-500">{t('admin.emailLogs.statsFailed')}</p>}

      {s && (
        <>
          <div className="flex gap-2">
            {DAY_RANGES.map((n) => (
              <Button
                key={n}
                size="sm"
                variant={n === days ? 'default' : 'outline'}
                onClick={() => setDays(n)}
              >
                {t('admin.emailLogs.lastDays', { count: n })}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label={t('admin.emailLogs.sentToday')}
              value={formatNumber(s.today.sent)}
              hint={
                usedPct !== null
                  ? t('admin.emailLogs.ofLimit', {
                      pct: usedPct,
                      limit: formatNumber(s.dailyLimit),
                    })
                  : undefined
              }
            />
            <StatCard
              label={t('admin.emailLogs.failedToday')}
              value={formatNumber(s.today.failed)}
            />
            <StatCard
              label={t('admin.emailLogs.sentRange', { count: days })}
              value={formatNumber(s.totals.sent)}
              hint={
                s.peakDay
                  ? t('admin.emailLogs.peak', {
                      day: showDay(s.peakDay.day),
                      count: formatNumber(s.peakDay.sent),
                    })
                  : undefined
              }
            />
            <StatCard
              label={t('admin.emailLogs.failureRate')}
              value={
                s.totals.failureRate === null ? '—' : `${(s.totals.failureRate * 100).toFixed(1)}%`
              }
              hint={t('admin.emailLogs.failedRange', {
                failed: formatNumber(s.totals.failed),
                skipped: formatNumber(s.totals.skipped),
              })}
            />
          </div>

          {s.reasons.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-500">{t('admin.emailLogs.topReasons')}</span>
              {s.reasons.map((r) => (
                <Badge key={r.reason} variant="danger">
                  {t(`admin.emailLogs.reason.${r.reason}`)} · {r.count}
                </Badge>
              ))}
            </div>
          )}

          <div className="max-h-80 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-left dark:bg-gray-800">
                <tr>
                  {['tableDay', 'statusSent', 'statusFailed', 'statusSkipped', 'tableVolume'].map(
                    (k) => (
                      <th
                        key={k}
                        className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300"
                      >
                        {t(`admin.emailLogs.${k}`)}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {[...s.daily].reverse().map((d) => (
                  <tr key={d.day} className="bg-white dark:bg-gray-900">
                    <td className="px-4 py-2 font-mono text-xs">{showDay(d.day)}</td>
                    <td className="px-4 py-2">{d.sent}</td>
                    <td className="px-4 py-2">{d.failed}</td>
                    <td className="px-4 py-2 text-gray-500">{d.skipped}</td>
                    <td className="w-1/2 px-4 py-2">
                      <div className="flex h-2 w-full overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
                        <div
                          className="bg-green-500"
                          style={{ width: `${(d.sent / barMax) * 100}%` }}
                        />
                        <div
                          className="bg-red-500"
                          style={{ width: `${(d.failed / barMax) * 100}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <form onSubmit={applyFilters} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          {t('admin.emailLogs.filterStatus')}
          <select
            className="h-9 rounded-md border border-gray-300 bg-white px-2 dark:border-gray-700 dark:bg-gray-900"
            value={filters.status}
            onChange={update('status')}
          >
            <option value="">{t('admin.emailLogs.allStatuses')}</option>
            {STATUSES.map((v) => (
              <option key={v} value={v}>
                {t(`admin.emailLogs.status.${v}`)}
              </option>
            ))}
          </select>
        </label>
        <Input
          label={t('admin.emailLogs.filterKind')}
          value={filters.kind}
          onChange={update('kind')}
        />
        <Input
          label={t('admin.emailLogs.filterReason')}
          value={filters.reason}
          onChange={update('reason')}
        />
        <Input
          label={t('admin.emailLogs.filterRecipient')}
          value={filters.to}
          onChange={update('to')}
        />
        <Button type="submit">{t('admin.requestLogs.applyFilters')}</Button>
        <Button type="button" variant="outline" onClick={clearFilters}>
          {t('admin.requestLogs.clearFilters')}
        </Button>
      </form>

      {logs.isLoading && <p className="text-gray-500">{t('common.loading')}</p>}
      {logs.error && <p className="text-red-500">{t('admin.emailLogs.loadFailed')}</p>}

      {logs.data && (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left dark:bg-gray-800">
                <tr>
                  {[
                    'tableAt',
                    'tableStatus',
                    'tableKind',
                    'tableTo',
                    'tableProvider',
                    'tableError',
                  ].map((k) => (
                    <th key={k} className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                      {t(`admin.emailLogs.${k}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {logs.data.logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                      {t('admin.emailLogs.noEntries')}
                    </td>
                  </tr>
                )}
                {logs.data.logs.map((log) => (
                  <tr
                    key={log._id}
                    className="bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800"
                  >
                    <td className="px-4 py-3 text-gray-500">{formatDateTime(log.at)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[log.status]}>
                        {t(`admin.emailLogs.status.${log.status}`)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">{log.kind ?? '—'}</td>
                    <td className="px-4 py-3">{log.to}</td>
                    <td className="px-4 py-3 text-gray-500">{log.provider}</td>
                    <td className="max-w-xs px-4 py-3 text-xs text-gray-500">
                      {log.reason && (
                        <span className="font-medium">
                          {t(`admin.emailLogs.reason.${log.reason}`)}
                        </span>
                      )}
                      {log.errorMessage && (
                        <span className="block truncate" title={log.errorMessage}>
                          {log.errorMessage}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">
              {t('admin.requestLogs.pageOf', { page: logs.data.page, pages: logs.data.pages || 1 })}
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
                disabled={page >= logs.data.pages}
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
