import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api.js';
import { useAuth } from '@/contexts/useAuth.js';
import { hasPermission } from '@/lib/access.js';
import { fmtDate, fullName } from '@/lib/format.js';
import { useBatch } from '@/hooks/useBatch.js';
import { BatchGate, BatchPicker } from '@/components/BatchPicker.jsx';
import { MetricCard } from '@/components/MetricCard.jsx';
import { PageHeader } from '@/components/ui/PageHeader.jsx';
import { Button } from '@/components/ui/Button.jsx';
import { Badge } from '@/components/ui/Badge.jsx';
import { Card, CardContent } from '@/components/ui/Card.jsx';
import { EmptyState, ErrorNote, Spinner } from '@/components/ui/Feedback.jsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table.jsx';

const STATUS_VARIANT = { completed: 'success', active: 'info', dropped: 'danger' };
const DECISIONS = ['completed', 'dropped', 'active'];

/**
 * One student's completion decision. Recording it asks for a second click: the
 * completion percentage is what the college is billed against, so a stray click
 * must not be able to change it.
 */
function DecisionRow({ row, batch, canDecide, onChanged }) {
  const { t, i18n } = useTranslation();
  const [decision, setDecision] = useState('');
  const [notes, setNotes] = useState('');
  const [confirming, setConfirming] = useState(false);
  const name = fullName(row.student);
  const choice = decision || (row.status === 'active' ? 'completed' : 'active');

  const save = useMutation({
    mutationFn: () =>
      api.put('/training/completion', {
        studentId: row.student._id,
        sectionId: batch.sectionId,
        status: choice,
        ...(notes ? { notes } : {}),
      }),
    onSuccess: () => {
      setConfirming(false);
      setDecision('');
      setNotes('');
      onChanged();
    },
  });

  return (
    <TableRow data-testid={`completion-${row.student.admissionNo}`}>
      <TableCell>
        <div className="font-medium">{name}</div>
        <div className="text-xs text-muted-foreground">{row.student.admissionNo}</div>
      </TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANT[row.status]} data-testid="completion-status">
          {t(`training.status.${row.status}`)}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {row.enrollment?.endDate ? fmtDate(row.enrollment.endDate, i18n.language) : '—'}
      </TableCell>
      <TableCell className="max-w-48 text-xs text-muted-foreground">
        {row.enrollment?.notes ?? '—'}
      </TableCell>
      {canDecide && (
        <TableCell>
          {!confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label={t('training.completion.decisionFor', { name })}
                className="h-8 rounded-lg border border-input bg-card px-2 text-sm"
                value={choice}
                onChange={(e) => setDecision(e.target.value)}
              >
                {DECISIONS.filter((d) => d !== row.status).map((d) => (
                  <option key={d} value={d}>
                    {t(`training.completion.decision.${d}`)}
                  </option>
                ))}
              </select>
              <input
                aria-label={t('training.completion.notesFor', { name })}
                placeholder={t('training.completion.notes')}
                className="h-8 w-40 rounded-lg border border-input bg-card px-2 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                aria-label={t('training.completion.recordFor', { name })}
                onClick={() => setConfirming(true)}
              >
                {t('training.completion.record')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2" role="group">
              <span className="text-sm">
                {t('training.completion.confirmQuestion', {
                  name,
                  decision: t(`training.completion.decision.${choice}`).toLowerCase(),
                })}
              </span>
              <Button
                size="sm"
                disabled={save.isPending}
                aria-label={t('training.completion.confirmFor', { name })}
                onClick={() => save.mutate()}
              >
                {t('common.confirm')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          )}
          {save.error && (
            <p role="alert" className="mt-1 text-xs text-destructive">
              {save.error.response?.data?.error ?? t('common.error')}
            </p>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}

export default function CompletionPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canDecide = hasPermission(user, 'training:complete');
  const batch = useBatch();
  const queryClient = useQueryClient();

  const rosterQuery = useQuery({
    queryKey: ['training-roster', batch.sectionId],
    queryFn: () =>
      api
        .get('/training/enrollments', { params: { sectionId: batch.sectionId } })
        .then((r) => r.data),
    enabled: batch.ready,
  });
  const metricsQuery = useQuery({
    queryKey: ['training-metrics', batch.sectionId, batch.termId],
    queryFn: () =>
      api
        .get('/training/metrics', { params: { sectionId: batch.sectionId, termId: batch.termId } })
        .then((r) => r.data),
    enabled: batch.ready,
  });

  const changed = () => {
    queryClient.invalidateQueries({ queryKey: ['training-roster'] });
    queryClient.invalidateQueries({ queryKey: ['training-metrics'] });
    queryClient.invalidateQueries({ queryKey: ['training-readiness'] });
  };
  const completion = metricsQuery.data?.metrics.completion;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('training.completion.title')}
        description={
          canDecide
            ? t('training.completion.descriptionAdmin')
            : t('training.completion.description')
        }
      />
      <BatchGate batch={batch}>
        <BatchPicker batch={batch} />
        {completion && (
          <div className="max-w-sm">
            <MetricCard
              id="completion"
              title={t('training.dashboard.completion')}
              metric={completion}
              detail={t('training.dashboard.completionDetail', {
                completed: completion.completed,
                enrolled: completion.enrolled,
                dropped: completion.dropped,
              })}
            />
          </div>
        )}
        {rosterQuery.isLoading && <Spinner />}
        {rosterQuery.error && <ErrorNote error={rosterQuery.error} onRetry={rosterQuery.refetch} />}
        {rosterQuery.data?.length === 0 && (
          <EmptyState
            title={t('training.completion.none')}
            description={t('training.completion.noneHint')}
          />
        )}
        {rosterQuery.data?.length > 0 && (
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('training.common.student')}</TableHead>
                    <TableHead>{t('training.common.status')}</TableHead>
                    <TableHead>{t('training.completion.ended')}</TableHead>
                    <TableHead>{t('training.completion.notes')}</TableHead>
                    {canDecide && <TableHead>{t('training.completion.decide')}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rosterQuery.data.map((row) => (
                    <DecisionRow
                      key={row.student._id}
                      row={row}
                      batch={batch}
                      canDecide={canDecide}
                      onChanged={changed}
                    />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </BatchGate>
    </div>
  );
}
