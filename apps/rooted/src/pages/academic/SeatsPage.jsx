import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card, CardContent } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { DataTable, TableRow, TableCell } from '../../components/ui/DataTable.jsx';

const errorOf = (err, fallback) =>
  (err.response?.data?.details && Object.values(err.response.data.details).flat()[0]) ||
  err.response?.data?.error ||
  fallback;

// Seat management: one seat at a time or a run of them, and taking a chair out of
// use. Who holds a seat is the seat map's business; deactivating a held seat is
// refused by the API with the holder's name.
export default function SeatsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [single, setSingle] = useState({ label: '', zone: '' });
  const [bulk, setBulk] = useState({ prefix: '', count: '', start: '1', zone: '' });

  const seats = useQuery({
    queryKey: ['seats'],
    queryFn: () => api.get('/academic/seats').then((r) => r.data),
  });

  const done = (message) => {
    setError('');
    setNotice(message);
    queryClient.invalidateQueries({ queryKey: ['seats'] });
    queryClient.invalidateQueries({ queryKey: ['seat-availability'] });
  };
  const failed = (err) => {
    setNotice('');
    setError(errorOf(err, t('studyCenter.seats.failed')));
  };

  const addOne = useMutation({
    mutationFn: () =>
      api.post('/academic/seats', {
        label: single.label,
        ...(single.zone ? { zone: single.zone } : {}),
      }),
    onSuccess: () => {
      setSingle({ label: '', zone: '' });
      done(t('studyCenter.seats.added'));
    },
    onError: failed,
  });

  const addMany = useMutation({
    mutationFn: () =>
      api
        .post('/academic/seats', {
          prefix: bulk.prefix,
          count: Number(bulk.count),
          start: Number(bulk.start || 1),
          ...(bulk.zone ? { zone: bulk.zone } : {}),
        })
        .then((r) => r.data),
    onSuccess: (result) => {
      setBulk((b) => ({ ...b, count: '' }));
      done(t('studyCenter.seats.bulkResult', result));
    },
    onError: failed,
  });

  const setActive = useMutation({
    mutationFn: ({ id, isActive }) => api.patch(`/academic/seats/${id}`, { isActive }),
    onSuccess: () => done(''),
    onError: failed,
  });

  const rows = seats.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('studyCenter.seats.title')}
        description={t('studyCenter.seats.description')}
      />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-3 pt-4">
            <h2 className="text-sm font-semibold">{t('studyCenter.seats.addOne')}</h2>
            <div className="grid grid-cols-2 gap-3">
              <Input
                id="seat-label"
                label={t('studyCenter.seats.label')}
                value={single.label}
                onChange={(e) => setSingle((s) => ({ ...s, label: e.target.value }))}
              />
              <Input
                id="seat-zone"
                label={t('studyCenter.seats.zone')}
                value={single.zone}
                onChange={(e) => setSingle((s) => ({ ...s, zone: e.target.value }))}
              />
            </div>
            <div>
              <Button
                disabled={!single.label.trim() || addOne.isPending}
                onClick={() => addOne.mutate()}
              >
                {t('studyCenter.seats.add')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 pt-4">
            <h2 className="text-sm font-semibold">{t('studyCenter.seats.addMany')}</h2>
            <p className="text-xs text-muted-foreground">{t('studyCenter.seats.addManyHint')}</p>
            <div className="grid grid-cols-3 gap-3">
              <Input
                id="bulk-prefix"
                label={t('studyCenter.seats.prefix')}
                value={bulk.prefix}
                onChange={(e) => setBulk((b) => ({ ...b, prefix: e.target.value }))}
              />
              <Input
                id="bulk-count"
                type="number"
                min="1"
                max="200"
                label={t('studyCenter.seats.count')}
                value={bulk.count}
                onChange={(e) => setBulk((b) => ({ ...b, count: e.target.value }))}
              />
              <Input
                id="bulk-start"
                type="number"
                min="0"
                label={t('studyCenter.seats.start')}
                value={bulk.start}
                onChange={(e) => setBulk((b) => ({ ...b, start: e.target.value }))}
              />
            </div>
            <Input
              id="bulk-zone"
              label={t('studyCenter.seats.zone')}
              value={bulk.zone}
              onChange={(e) => setBulk((b) => ({ ...b, zone: e.target.value }))}
            />
            <div>
              <Button
                disabled={!Number(bulk.count) || addMany.isPending}
                onClick={() => addMany.mutate()}
              >
                {t('studyCenter.seats.addSeats')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable
        headers={[
          t('studyCenter.seats.label'),
          t('studyCenter.seats.zone'),
          t('common.status'),
          '',
        ]}
        isLoading={seats.isLoading}
        isEmpty={!seats.isLoading && rows.length === 0}
        emptyMessage={t('studyCenter.seats.empty')}
      >
        {rows.map((seat) => (
          <TableRow key={seat._id}>
            <TableCell className="font-medium">{seat.label}</TableCell>
            <TableCell>{seat.zone ?? '—'}</TableCell>
            <TableCell>
              <Badge variant={seat.isActive ? 'success' : 'secondary'}>
                {seat.isActive ? t('studyCenter.seats.inUse') : t('studyCenter.seats.outOfUse')}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <Button
                variant="outline"
                size="sm"
                disabled={setActive.isPending}
                onClick={() => setActive.mutate({ id: seat._id, isActive: !seat.isActive })}
              >
                {seat.isActive ? t('studyCenter.seats.takeOut') : t('studyCenter.seats.putBack')}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
    </div>
  );
}
