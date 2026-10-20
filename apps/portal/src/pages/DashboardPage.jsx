import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import api from '@/lib/api.js';
import { useBatch } from '@/hooks/useBatch.js';
import { BatchGate, BatchPicker } from '@/components/BatchPicker.jsx';
import { MetricCard } from '@/components/MetricCard.jsx';
import { PageHeader } from '@/components/ui/PageHeader.jsx';
import { Button } from '@/components/ui/Button.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card.jsx';
import { ErrorNote, Spinner } from '@/components/ui/Feedback.jsx';
import { fmtNum } from '@/lib/format.js';

export default function DashboardPage() {
  const { t } = useTranslation();
  const batch = useBatch();
  const [downloadError, setDownloadError] = useState(null);

  const metricsQuery = useQuery({
    queryKey: ['training-metrics', batch.sectionId, batch.termId],
    queryFn: () =>
      api
        .get('/training/metrics', { params: { sectionId: batch.sectionId, termId: batch.termId } })
        .then((r) => r.data),
    enabled: batch.ready,
  });

  async function downloadReport() {
    setDownloadError(null);
    try {
      const res = await api.get('/training/report.pdf', {
        params: { sectionId: batch.sectionId, termId: batch.termId },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'completion-report.pdf';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err);
    }
  }

  const m = metricsQuery.data?.metrics;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('training.dashboard.title')}
        description={t('training.dashboard.description')}
        action={
          <Button variant="outline" onClick={downloadReport} disabled={!m}>
            <Download className="size-4" aria-hidden="true" />
            {t('training.dashboard.downloadReport')}
          </Button>
        }
      />
      <BatchGate batch={batch}>
        <BatchPicker batch={batch} />
        {downloadError && <ErrorNote error={downloadError} />}
        {metricsQuery.isLoading && <Spinner />}
        {metricsQuery.error && (
          <ErrorNote error={metricsQuery.error} onRetry={metricsQuery.refetch} />
        )}
        {m && (
          <>
            <p className="text-sm text-muted-foreground" data-testid="enrolled-count">
              {t('training.dashboard.enrolled', { count: m.enrolled, active: m.active })}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                id="attendance"
                title={t('training.dashboard.attendance')}
                metric={m.attendance}
                detail={t('training.dashboard.belowTarget', {
                  count: m.attendance.studentsBelowTarget,
                })}
              />
              <MetricCard
                id="completion"
                title={t('training.dashboard.completion')}
                metric={m.completion}
                detail={t('training.dashboard.completionDetail', {
                  completed: m.completion.completed,
                  enrolled: m.completion.enrolled,
                  dropped: m.completion.dropped,
                })}
              />
              <MetricCard
                id="project"
                title={t('training.dashboard.project')}
                metric={m.project}
                detail={t('training.dashboard.outOf', {
                  done: m.project.completed,
                  total: m.project.eligible,
                })}
              />
              <MetricCard
                id="mock"
                title={t('training.dashboard.mock')}
                metric={m.mockInterview}
                detail={t('training.dashboard.outOf', {
                  done: m.mockInterview.completed,
                  total: m.mockInterview.eligible,
                })}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card data-testid="metric-improvement">
                <CardHeader>
                  <CardTitle as="h3">{t('training.dashboard.improvement')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p
                    className="text-3xl font-semibold tracking-tight"
                    data-testid="improvement-value"
                  >
                    {m.improvement.avgDelta === null
                      ? fmtNum(null)
                      : t('training.dashboard.marks', { count: m.improvement.avgDelta })}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('training.dashboard.measured', { count: m.improvement.studentsMeasured })}
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="metric-placement">
                <CardHeader>
                  <CardTitle as="h3">{t('training.dashboard.placement')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {['applied', 'interviewed', 'offered', 'joined'].map((stage) => (
                      <div key={stage}>
                        <dt className="text-xs text-muted-foreground">
                          {t(`training.stage.${stage}`)}
                        </dt>
                        <dd className="text-2xl font-semibold" data-testid={`placement-${stage}`}>
                          {m.placement[stage]}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('training.dashboard.rejected', { count: m.placement.rejected })}
                  </p>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </BatchGate>
    </div>
  );
}
