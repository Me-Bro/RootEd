import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import api from '../../lib/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card, CardContent } from '../../components/ui/Card.jsx';
import { Progress, ProgressTrack, ProgressIndicator } from '../../components/ui/progress.jsx';

export default function FinanceSummaryPage() {
  const { t } = useTranslation();

  const { data: feeSummary } = useQuery({
    queryKey: ['fee', 'collection-summary'],
    queryFn: () => api.get('/fee/collection-summary').then((r) => r.data),
  });

  return (
    <div className="flex flex-col gap-5">
      <Link to="/dashboard" className="text-sm text-muted-foreground hover:underline w-fit">
        {t('common.backToDashboard')}
      </Link>
      <PageHeader title={t('dashboard.financeSummary.title')} />

      <Card>
        <CardContent className="pt-4">
          <p className="text-sm font-medium text-muted-foreground">
            {t('dashboard.financeSummary.collectionCard')}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground">
              {feeSummary?.collectedPct != null ? `${feeSummary.collectedPct}%` : '—'}
            </span>
            <span className="text-sm text-muted-foreground">
              {t('dashboard.financeSummary.collectedLabel')}
            </span>
          </div>
          <Progress value={feeSummary?.collectedPct ?? 0} className="mt-3">
            <ProgressTrack>
              <ProgressIndicator className="bg-green-600 dark:bg-green-500" />
            </ProgressTrack>
          </Progress>
          {feeSummary && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t('dashboard.financeSummary.collectedOf', {
                collected: `₹${feeSummary.totalCollected.toLocaleString('en-IN')}`,
                assigned: `₹${feeSummary.totalAssigned.toLocaleString('en-IN')}`,
              })}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-destructive">
                {feeSummary?.defaulterCount ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.financeSummary.defaultersCard', {
                  count: feeSummary?.defaulterCount ?? 0,
                })}
                {feeSummary &&
                  ` · ${t('dashboard.financeSummary.overdueAmount', { amount: feeSummary.overdueTotal.toLocaleString('en-IN') })}`}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Link to="/fee" className="text-sm text-primary hover:underline w-fit">
        {t('dashboard.financeSummary.viewDefaulters')} ›
      </Link>
    </div>
  );
}
