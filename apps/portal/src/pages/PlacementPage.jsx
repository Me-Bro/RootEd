import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { allowedNextStages } from '@rooted/shared/utils';
import api from '@/lib/api.js';
import { useAuth } from '@/contexts/useAuth.js';
import { hasPermission } from '@/lib/access.js';
import { fmtDate, fullName } from '@/lib/format.js';
import { useBatch } from '@/hooks/useBatch.js';
import { BatchGate, BatchPicker } from '@/components/BatchPicker.jsx';
import { PageHeader } from '@/components/ui/PageHeader.jsx';
import { Button } from '@/components/ui/Button.jsx';
import { Input, Select } from '@/components/ui/Input.jsx';
import { Badge } from '@/components/ui/Badge.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card.jsx';
import { EmptyState, ErrorNote, Spinner } from '@/components/ui/Feedback.jsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table.jsx';

const STAGE_VARIANT = {
  applied: 'default',
  interviewed: 'info',
  offered: 'warning',
  joined: 'success',
  rejected: 'danger',
  withdrawn: 'danger',
};

function EmployerSection({ employers, canWrite, onChanged }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const add = useMutation({
    mutationFn: () => api.post('/training/employers', { name }),
    onSuccess: () => {
      setName('');
      onChanged();
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t('training.placement.employers')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {employers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('training.placement.noEmployers')}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {employers.map((e) => (
              <li key={e._id}>
                <Badge variant="info">{e.name}</Badge>
              </li>
            ))}
          </ul>
        )}
        {canWrite && (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            <div className="w-64">
              <Input
                label={t('training.placement.employerName')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <Button type="submit" variant="outline" disabled={add.isPending}>
              {t('training.placement.addEmployer')}
            </Button>
          </form>
        )}
        {add.error && <ErrorNote error={add.error} />}
      </CardContent>
    </Card>
  );
}

function NewApplicationForm({ roster, employers, onCreated }) {
  const { t } = useTranslation();
  const [studentId, setStudentId] = useState('');
  const [employerId, setEmployerId] = useState('');
  const [role, setRole] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.post('/training/placements', {
        studentId: studentId || roster[0]?.student._id,
        employerId: employerId || employers[0]?._id,
        role,
      }),
    onSuccess: () => {
      setRole('');
      onCreated();
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t('training.placement.newApplication')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Select
            label={t('training.common.student')}
            value={studentId || roster[0]?.student._id || ''}
            onChange={(e) => setStudentId(e.target.value)}
          >
            {roster.map(({ student }) => (
              <option key={student._id} value={student._id}>
                {fullName(student)}
              </option>
            ))}
          </Select>
          <Select
            label={t('training.placement.employer')}
            value={employerId || employers[0]?._id || ''}
            onChange={(e) => setEmployerId(e.target.value)}
          >
            {employers.map((e) => (
              <option key={e._id} value={e._id}>
                {e.name}
              </option>
            ))}
          </Select>
          <Input
            label={t('training.placement.role')}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            required
          />
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={create.isPending || !roster.length || !employers.length}
            >
              {t('training.placement.addApplication')}
            </Button>
          </div>
        </form>
        {create.error && <ErrorNote error={create.error} />}
      </CardContent>
    </Card>
  );
}

function ApplicationRow({ application, canWrite, onChanged }) {
  const { t, i18n } = useTranslation();
  const next = allowedNextStages(application.stage);
  const [target, setTarget] = useState('');
  const move = useMutation({
    mutationFn: () =>
      api.patch(`/training/placements/${application._id}`, { stage: target || next[0] }),
    onSuccess: () => {
      setTarget('');
      onChanged();
    },
  });
  const who = fullName(application.student);

  return (
    <TableRow data-testid={`application-${application.student?.admissionNo}-${application.role}`}>
      <TableCell className="font-medium">{who}</TableCell>
      <TableCell>{application.employer?.name ?? '—'}</TableCell>
      <TableCell>{application.role}</TableCell>
      <TableCell>
        <Badge variant={STAGE_VARIANT[application.stage]}>
          {t(`training.stage.${application.stage}`)}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {fmtDate(application.appliedAt, i18n.language)}
      </TableCell>
      <TableCell>
        {canWrite && next.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              aria-label={t('training.placement.moveFor', { name: who })}
              className="h-8 rounded-lg border border-input bg-card px-2 text-sm"
              value={target || next[0]}
              onChange={(e) => setTarget(e.target.value)}
            >
              {next.map((stage) => (
                <option key={stage} value={stage}>
                  {t(`training.stage.${stage}`)}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={move.isPending}
              onClick={() => move.mutate()}
              aria-label={t('training.placement.moveButtonFor', { name: who })}
            >
              {t('training.placement.move')}
            </Button>
          </div>
        )}
        {move.error && (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {move.error.response?.data?.error ?? t('common.error')}
          </p>
        )}
      </TableCell>
    </TableRow>
  );
}

function ConsentSection({ roster, canWrite, onChanged }) {
  const { t } = useTranslation();
  const set = useMutation({
    mutationFn: ({ id, granted }) => api.put(`/training/students/${id}/consent`, { granted }),
    onSuccess: onChanged,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t('training.placement.consent')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('training.placement.consentHint')}</p>
      </CardHeader>
      <CardContent>
        {set.error && <ErrorNote error={set.error} />}
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {roster.map(({ student }) => (
            <li key={student._id}>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(student.placementConsent?.granted)}
                  disabled={!canWrite || set.isPending}
                  onChange={(e) => set.mutate({ id: student._id, granted: e.target.checked })}
                />
                {fullName(student)}
              </label>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function PlacementPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canWrite = hasPermission(user, 'training:write');
  const batch = useBatch();
  const queryClient = useQueryClient();

  const employersQuery = useQuery({
    queryKey: ['training-employers'],
    queryFn: () => api.get('/training/employers').then((r) => r.data),
  });
  const placementsQuery = useQuery({
    queryKey: ['training-placements', batch.sectionId],
    queryFn: () =>
      api
        .get('/training/placements', { params: { sectionId: batch.sectionId } })
        .then((r) => r.data),
    enabled: batch.ready,
  });
  const rosterQuery = useQuery({
    queryKey: ['training-roster', batch.sectionId],
    queryFn: () =>
      api
        .get('/training/enrollments', { params: { sectionId: batch.sectionId } })
        .then((r) => r.data),
    enabled: batch.ready,
  });

  const roster = (rosterQuery.data ?? []).filter((r) => r.status !== 'dropped');
  const employers = (employersQuery.data ?? []).filter((e) => e.active !== false);
  const refreshPlacements = () =>
    queryClient.invalidateQueries({ queryKey: ['training-placements'] });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('training.placement.title')}
        description={t('training.placement.description')}
      />
      <BatchGate batch={batch}>
        <BatchPicker batch={batch} showTerm={false} />
        <EmployerSection
          employers={employers}
          canWrite={canWrite}
          onChanged={() => queryClient.invalidateQueries({ queryKey: ['training-employers'] })}
        />
        {canWrite && (
          <NewApplicationForm roster={roster} employers={employers} onCreated={refreshPlacements} />
        )}

        {placementsQuery.isLoading && <Spinner />}
        {placementsQuery.error && (
          <ErrorNote error={placementsQuery.error} onRetry={placementsQuery.refetch} />
        )}
        {placementsQuery.data?.length === 0 && (
          <EmptyState
            title={t('training.placement.none')}
            description={t('training.placement.noneHint')}
          />
        )}
        {placementsQuery.data?.length > 0 && (
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('training.common.student')}</TableHead>
                    <TableHead>{t('training.placement.employer')}</TableHead>
                    <TableHead>{t('training.placement.role')}</TableHead>
                    <TableHead>{t('training.placement.stageLabel')}</TableHead>
                    <TableHead>{t('training.placement.applied')}</TableHead>
                    <TableHead>
                      <span className="sr-only">{t('training.placement.move')}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {placementsQuery.data.map((application) => (
                    <ApplicationRow
                      key={application._id}
                      application={application}
                      canWrite={canWrite}
                      onChanged={refreshPlacements}
                    />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <ConsentSection
          roster={roster}
          canWrite={canWrite}
          onChanged={() => queryClient.invalidateQueries({ queryKey: ['training-roster'] })}
        />
      </BatchGate>
    </div>
  );
}
