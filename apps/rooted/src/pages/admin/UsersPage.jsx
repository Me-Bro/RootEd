import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { DataTable, TableRow, TableCell } from '../../components/ui/DataTable.jsx';
import { SelectField, SelectItem } from '../../components/ui/SelectField.jsx';
import { formatDateTime } from '../../utils/intl.js';

const STATUS_BADGE_VARIANT = { active: 'success', suspended: 'destructive' };

export default function UsersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('unverified');
  const [notice, setNotice] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-users', q, filter, page],
    queryFn: () => {
      const params = new URLSearchParams({ page });
      if (q) params.set('q', q);
      if (filter === 'unverified') params.set('unverified', '1');
      return api.get(`/admin/users?${params}`).then((r) => r.data);
    },
  });

  const action = useMutation({
    mutationFn: ({ id, kind }) => api.post(`/admin/users/${id}/${kind}`).then((r) => r.data),
    onSuccess: (_d, { kind }) => {
      setNotice({
        error: false,
        text: t(kind === 'verify-email' ? 'admin.users.verified' : 'admin.users.resent'),
      });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err) =>
      setNotice({
        error: true,
        text: err.response?.data?.error ?? t('admin.users.actionFailed'),
      }),
  });

  const users = data?.users ?? [];
  const busyId = action.isPending ? action.variables?.id : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('nav.platformUsers')} />

      <form
        className="flex gap-3 flex-wrap items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(search.trim());
          setPage(1);
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          {t('admin.users.searchLabel')}
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.users.searchPlaceholder')}
            className="h-9 w-72 rounded-md border border-input bg-background px-3 text-sm"
          />
        </label>
        <Button type="submit" variant="outline">
          {t('admin.users.search')}
        </Button>
        <SelectField
          label={t('admin.users.filterLabel')}
          value={filter}
          onValueChange={(v) => {
            setFilter(v);
            setPage(1);
          }}
          className="w-48"
        >
          <SelectItem value="unverified">{t('admin.users.unverifiedOnly')}</SelectItem>
          <SelectItem value="all">{t('admin.users.allUsers')}</SelectItem>
        </SelectField>
      </form>

      {notice && (
        <p role="status" className={notice.error ? 'text-destructive' : 'text-muted-foreground'}>
          {notice.text}
        </p>
      )}

      {error && <p className="text-destructive">{t('admin.users.loadFailed')}</p>}

      {!error && (
        <DataTable
          headers={[
            t('admin.users.tableUser'),
            t('common.status'),
            t('admin.users.tableEmailVerified'),
            t('admin.users.tableRegistered'),
            t('common.actions'),
          ]}
          isLoading={isLoading}
          isEmpty={users.length === 0}
          emptyMessage={t('admin.users.noneFound')}
        >
          {users.map((u) => {
            const name = [u.firstName, u.lastName].filter(Boolean).join(' ');
            return (
              <TableRow key={u._id} className="bg-card">
                <TableCell className="px-4 py-3">
                  <div className="font-medium">{name || u.username || '—'}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </TableCell>
                <TableCell className="px-4 py-3">
                  <Badge variant={STATUS_BADGE_VARIANT[u.status] ?? 'warning'}>{u.status}</Badge>
                </TableCell>
                <TableCell className="px-4 py-3">
                  <Badge variant={u.emailVerified ? 'success' : 'warning'}>
                    {t(u.emailVerified ? 'admin.users.yes' : 'admin.users.no')}
                  </Badge>
                </TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">
                  {formatDateTime(u.createdAt)}
                </TableCell>
                <TableCell className="px-4 py-3">
                  {!u.emailVerified && u.status !== 'deleted' && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === u._id}
                        onClick={() => action.mutate({ id: u._id, kind: 'resend-verification' })}
                      >
                        {t('admin.users.resend')}
                      </Button>
                      <Button
                        size="sm"
                        disabled={busyId === u._id}
                        onClick={() => {
                          if (window.confirm(t('admin.users.verifyConfirm', { email: u.email }))) {
                            action.mutate({ id: u._id, kind: 'verify-email' });
                          }
                        }}
                      >
                        {t('admin.users.verify')}
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
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
