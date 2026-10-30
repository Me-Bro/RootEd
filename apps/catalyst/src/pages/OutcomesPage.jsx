import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api.js';
import { fmtNum, fmtPct } from '@/lib/format.js';
import { PageHeader } from '@/components/ui/PageHeader.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card.jsx';
import { EmptyState, ErrorNote, ListSkeleton } from '@/components/ui/Feedback.jsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table.jsx';

/**
 * Per-college outcomes for the Rural Root Cloud team. The API sends counts and
 * percentages only, so there is nothing about an individual to show here.
 */
export default function OutcomesPage() {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['training-outcomes'],
    queryFn: () => api.get('/admin/training/outcomes').then((r) => r.data),
  });

  if (query.isLoading) return <ListSkeleton />;
  if (query.error) return <ErrorNote error={query.error} onRetry={query.refetch} />;

  const { colleges, totals } = query.data;
  const cards = [
    ['colleges', t('outcomes.colleges'), totals.colleges],
    ['enrolled', t('outcomes.enrolled'), totals.enrolled],
    ['completed', t('outcomes.completed'), totals.completed],
    ['joined', t('outcomes.joined'), totals.joined],
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('outcomes.title')} description={t('outcomes.description')} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map(([id, label, value]) => (
          <Card key={id} data-testid={`total-${id}`}>
            <CardHeader>
              <CardTitle as="h3" className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tracking-tight">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {colleges.length === 0 ? (
        <EmptyState title={t('outcomes.none')} description={t('outcomes.noneHint')} />
      ) : (
        <Card>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('outcomes.college')}</TableHead>
                  <TableHead>{t('outcomes.enrolled')}</TableHead>
                  <TableHead>{t('outcomes.completed')}</TableHead>
                  <TableHead>{t('outcomes.completionPct')}</TableHead>
                  <TableHead>{t('outcomes.attendance')}</TableHead>
                  <TableHead>{t('outcomes.improvement')}</TableHead>
                  <TableHead>{t('training.stage.applied')}</TableHead>
                  <TableHead>{t('training.stage.interviewed')}</TableHead>
                  <TableHead>{t('training.stage.offered')}</TableHead>
                  <TableHead>{t('training.stage.joined')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {colleges.map((c) => (
                  <TableRow key={c.tenantId} data-testid={`outcome-${c.name}`}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.enrolled}</TableCell>
                    <TableCell>{c.completed}</TableCell>
                    <TableCell>{fmtPct(c.completionPct)}</TableCell>
                    <TableCell>{fmtPct(c.attendancePct)}</TableCell>
                    <TableCell>{fmtNum(c.avgDelta)}</TableCell>
                    <TableCell>{c.placement.applied}</TableCell>
                    <TableCell>{c.placement.interviewed}</TableCell>
                    <TableCell>{c.placement.offered}</TableCell>
                    <TableCell>{c.placement.joined}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
