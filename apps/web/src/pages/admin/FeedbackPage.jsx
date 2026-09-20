import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { DataTable, TableRow, TableCell } from '../../components/ui/DataTable.jsx';
import { SelectField, SelectItem } from '../../components/ui/SelectField.jsx';

const STATUSES = ['new', 'in_progress', 'resolved'];
const STATUS_BADGE_VARIANT = { new: 'default', in_progress: 'warning', resolved: 'success' };
// Mirrors apps/api/src/services/feedbackStatusTransitions.js — kept in sync
// by hand, same as StudentDetailPage.jsx's STATUS_TRANSITIONS.
const STATUS_TRANSITIONS = {
  new: ['in_progress', 'resolved'],
  in_progress: ['new', 'resolved'],
  resolved: ['in_progress'],
};

export default function FeedbackPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-feedback', status, category, page],
    queryFn: () => {
      const params = new URLSearchParams({ page });
      if (status) params.set('status', status);
      if (category) params.set('category', category);
      return api.get(`/admin/feedback?${params}`).then((r) => r.data);
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status: newStatus }) =>
      api.patch(`/admin/feedback/${id}`, { status: newStatus }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-feedback'] }),
  });

  const feedback = data?.feedback ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('nav.feedback')} />

      <div className="flex gap-3 flex-wrap items-end">
        <SelectField
          label={t('admin.feedback.statusLabel')}
          value={status || 'all'}
          onValueChange={(v) => {
            setStatus(v === 'all' ? '' : v);
            setPage(1);
          }}
          className="w-48"
        >
          <SelectItem value="all">{t('admin.feedback.allStatuses')}</SelectItem>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {t(`admin.feedback.status.${s}`)}
            </SelectItem>
          ))}
        </SelectField>
        <SelectField
          label={t('admin.feedback.categoryLabel')}
          value={category || 'all'}
          onValueChange={(v) => {
            setCategory(v === 'all' ? '' : v);
            setPage(1);
          }}
          className="w-48"
        >
          <SelectItem value="all">{t('admin.feedback.allCategories')}</SelectItem>
          {['contact', 'feedback', 'bug', 'other'].map((c) => (
            <SelectItem key={c} value={c}>
              {t(`admin.feedback.category.${c}`)}
            </SelectItem>
          ))}
        </SelectField>
      </div>

      {error && <p className="text-destructive">{t('admin.feedback.loadFailed')}</p>}

      {!error && (
        <DataTable
          headers={[
            t('admin.feedback.tableFrom'),
            t('admin.feedback.tableCategory'),
            t('admin.feedback.tableMessage'),
            t('common.status'),
            t('admin.feedback.tableReceivedAt'),
            t('common.actions'),
          ]}
          isLoading={isLoading}
          isEmpty={feedback.length === 0}
          emptyMessage={t('admin.feedback.noneFound')}
        >
          {feedback.map((f) => (
            <TableRow key={f._id} className="bg-card">
              <TableCell className="px-4 py-3">
                <div className="font-medium">{f.name}</div>
                <div className="text-xs text-muted-foreground">{f.email}</div>
              </TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">
                {t(`admin.feedback.category.${f.category}`)}
              </TableCell>
              <TableCell className="px-4 py-3 max-w-md truncate" title={f.message}>
                {f.message}
              </TableCell>
              <TableCell className="px-4 py-3">
                <Badge variant={STATUS_BADGE_VARIANT[f.status]}>
                  {t(`admin.feedback.status.${f.status}`)}
                </Badge>
              </TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">
                {new Date(f.createdAt).toLocaleString()}
              </TableCell>
              <TableCell className="px-4 py-3">
                <SelectField
                  ariaLabel={t('admin.feedback.changeStatusLabel', { name: f.name })}
                  value={f.status}
                  onValueChange={(newStatus) =>
                    statusMutation.mutate({ id: f._id, status: newStatus })
                  }
                  disabled={statusMutation.isPending && statusMutation.variables?.id === f._id}
                  className="w-40"
                >
                  <SelectItem value={f.status}>{t(`admin.feedback.status.${f.status}`)}</SelectItem>
                  {STATUS_TRANSITIONS[f.status].map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`admin.feedback.status.${s}`)}
                    </SelectItem>
                  ))}
                </SelectField>
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
