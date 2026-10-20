import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api.js';
import { fmtNum, fmtPct, fullName } from '@/lib/format.js';
import { useBatch } from '@/hooks/useBatch.js';
import { BatchGate, BatchPicker } from '@/components/BatchPicker.jsx';
import { PageHeader } from '@/components/ui/PageHeader.jsx';
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

export default function ReadinessPage() {
  const { t } = useTranslation();
  const batch = useBatch();
  const query = useQuery({
    queryKey: ['training-readiness', batch.sectionId, batch.termId],
    queryFn: () =>
      api
        .get('/training/readiness', {
          params: { sectionId: batch.sectionId, termId: batch.termId },
        })
        .then((r) => r.data),
    enabled: batch.ready,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('training.readiness.title')}
        description={t('training.readiness.description')}
      />
      <BatchGate batch={batch}>
        <BatchPicker batch={batch} />
        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          {t('training.readiness.indicativeNote')}
        </p>
        {query.isLoading && <Spinner />}
        {query.error && <ErrorNote error={query.error} onRetry={query.refetch} />}
        {query.data?.rows.length === 0 && <EmptyState title={t('training.readiness.none')} />}
        {query.data?.rows.length > 0 && (
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('training.common.student')}</TableHead>
                    <TableHead>{t('training.common.status')}</TableHead>
                    <TableHead>{t('training.readiness.attendance')}</TableHead>
                    <TableHead>{t('training.readiness.assignments')}</TableHead>
                    <TableHead>{t('training.readiness.final')}</TableHead>
                    <TableHead>{t('training.readiness.improvement')}</TableHead>
                    <TableHead>{t('training.readiness.project')}</TableHead>
                    <TableHead>{t('training.readiness.mock')}</TableHead>
                    <TableHead>{t('training.readiness.placement')}</TableHead>
                    <TableHead>{t('training.readiness.score')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.rows.map((row) => (
                    <TableRow
                      key={row.studentId}
                      data-testid={`readiness-${row.student.admissionNo}`}
                    >
                      <TableCell>
                        <div className="font-medium">{fullName(row.student)}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.student.admissionNo}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[row.status]}>
                          {t(`training.status.${row.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>{fmtPct(row.attendancePct)}</TableCell>
                      <TableCell>{fmtPct(row.assignmentsPct)}</TableCell>
                      <TableCell>{fmtNum(row.finalAvg)}</TableCell>
                      <TableCell>{fmtNum(row.delta)}</TableCell>
                      <TableCell>{fmtNum(row.projectScore)}</TableCell>
                      <TableCell>{fmtNum(row.mockScore)}</TableCell>
                      <TableCell>
                        {row.placementStage ? t(`training.stage.${row.placementStage}`) : '—'}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium" data-testid="readiness-score">
                          {fmtNum(row.readiness.score)}
                        </span>{' '}
                        {row.readiness.provisional && (
                          <Badge variant="warning">{t('common.provisional')}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
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
