import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api.js';
import { fmtNum, fmtPct, fullName, matchesQuery } from '@/lib/format.js';
import { downloadCsv } from '@/lib/csv.js';
import { useBatch } from '@/hooks/useBatch.js';
import { BatchGate, BatchPicker } from '@/components/BatchPicker.jsx';
import { TableTools } from '@/components/TableTools.jsx';
import { PageHeader } from '@/components/ui/PageHeader.jsx';
import { Badge } from '@/components/ui/Badge.jsx';
import { Card, CardContent } from '@/components/ui/Card.jsx';
import { EmptyState, ErrorNote, ListSkeleton } from '@/components/ui/Feedback.jsx';
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
  const [search, setSearch] = useState('');
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

  const allRows = query.data?.rows ?? [];
  const rows = allRows.filter((r) =>
    matchesQuery(search, fullName(r.student), r.student.admissionNo)
  );

  function exportCsv() {
    downloadCsv(
      'readiness.csv',
      [
        t('training.common.student'),
        t('training.readiness.admissionNo'),
        t('training.common.status'),
        t('training.readiness.attendance'),
        t('training.readiness.assignments'),
        t('training.readiness.final'),
        t('training.readiness.improvement'),
        t('training.readiness.project'),
        t('training.readiness.mock'),
        t('training.readiness.placement'),
        t('training.readiness.score'),
      ],
      rows.map((r) => [
        fullName(r.student),
        r.student.admissionNo,
        t(`training.status.${r.status}`),
        r.attendancePct,
        r.assignmentsPct,
        r.finalAvg,
        r.delta,
        r.projectScore,
        r.mockScore,
        r.placementStage ? t(`training.stage.${r.placementStage}`) : null,
        r.readiness.score,
      ])
    );
  }

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
        {query.isLoading && <ListSkeleton />}
        {query.error && <ErrorNote error={query.error} onRetry={query.refetch} />}
        {query.data?.rows.length === 0 && <EmptyState title={t('training.readiness.none')} />}
        {allRows.length > 0 && (
          <TableTools
            query={search}
            onQuery={setSearch}
            shown={rows.length}
            total={allRows.length}
            onExport={exportCsv}
          />
        )}
        {allRows.length > 0 && rows.length === 0 && <EmptyState title={t('common.noMatches')} />}
        {rows.length > 0 && (
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
                  {rows.map((row) => (
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
