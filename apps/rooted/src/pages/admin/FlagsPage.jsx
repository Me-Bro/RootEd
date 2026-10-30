import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { DataTable, TableRow, TableCell } from '../../components/ui/DataTable.jsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog.jsx';

function NewFlagModal({ open, onOpenChange }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ key: '', description: '', enabled: false });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (data) =>
      api
        .patch(`/admin/flags/${data.key}`, { enabled: data.enabled, description: data.description })
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flags'] });
      onOpenChange(false);
      setForm({ key: '', description: '', enabled: false });
      setError('');
    },
    onError: (err) => setError(err.response?.data?.error || t('admin.flags.createFailed')),
  });

  function update(field) {
    return (e) =>
      setForm((f) => ({
        ...f,
        [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
      }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('admin.flags.newFlag')}</DialogTitle>
        </DialogHeader>
        <form
          id="new-flag"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(form);
          }}
          className="flex flex-col gap-4"
        >
          <Input
            label={t('admin.flags.keyLabel')}
            value={form.key}
            onChange={update('key')}
            required
            placeholder="new-dashboard-layout"
          />
          <Input
            label={t('admin.flags.descriptionLabel')}
            value={form.description}
            onChange={update('description')}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.enabled} onChange={update('enabled')} />
            <span>{t('admin.flags.enabledLabel')}</span>
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="new-flag" disabled={mutation.isPending}>
            {mutation.isPending ? t('admin.flags.creating') : t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FlagsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);

  const {
    data: flags = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['flags'],
    queryFn: () => api.get('/admin/flags').then((r) => r.data),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ key, enabled }) =>
      api.patch(`/admin/flags/${key}`, { enabled }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flags'] }),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('nav.flags')}
        action={<Button onClick={() => setShowNew(true)}>{t('admin.flags.newFlag')}</Button>}
      />

      {error && <p className="text-destructive">{t('admin.flags.loadFailed')}</p>}

      {!error &&
        (flags.length === 0 && !isLoading ? (
          <EmptyState
            title={t('admin.flags.emptyTitle')}
            description={t('admin.flags.emptyDescription')}
          />
        ) : (
          <DataTable
            headers={[
              t('admin.flags.tableKey'),
              t('admin.flags.tableDescription'),
              t('common.status'),
              t('admin.flags.tableUpdatedAt'),
              t('common.actions'),
            ]}
            isLoading={isLoading}
            isEmpty={false}
          >
            {flags.map((flag) => (
              <TableRow key={flag._id} className="bg-card">
                <TableCell className="px-4 py-3 font-mono text-xs font-medium">
                  {flag.key}
                </TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">
                  {flag.description || '—'}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <Badge variant={flag.enabled ? 'success' : 'default'}>
                    {flag.enabled ? t('admin.flags.enabled') : t('admin.flags.disabled')}
                  </Badge>
                </TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">
                  {flag.updatedAt ? new Date(flag.updatedAt).toLocaleString() : '—'}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleMutation.mutate({ key: flag.key, enabled: !flag.enabled })}
                    disabled={
                      toggleMutation.isPending && toggleMutation.variables?.key === flag.key
                    }
                  >
                    {flag.enabled ? t('admin.flags.disable') : t('admin.flags.enable')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </DataTable>
        ))}

      <NewFlagModal open={showNew} onOpenChange={setShowNew} />
    </div>
  );
}
