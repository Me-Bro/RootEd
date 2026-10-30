import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/Card.jsx';
import { EmptyState } from '@/components/ui/EmptyState.jsx';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.jsx';

// "Year" is a notice, not a chart, when there isn't a year of history yet —
// drawing an extrapolated line from a few weeks of real data would be a
// claim the data hasn't earned (docs/mobile-ui/20-dashboard-approved.html §3).
export default function TrendChart({
  period,
  onPeriodChange,
  points,
  headline,
  subline,
  notEnoughHistory,
}) {
  const { t } = useTranslation();

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase text-muted-foreground">
          {t('dashboard.principal.attendanceTrend')}
        </p>
        <Tabs value={period} onValueChange={onPeriodChange}>
          <TabsList>
            <TabsTrigger value="7d">{t('dashboard.principal.period7d')}</TabsTrigger>
            <TabsTrigger value="30d">{t('dashboard.principal.period30d')}</TabsTrigger>
            <TabsTrigger value="year">{t('dashboard.principal.periodYear')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <Card className="mt-2">
        <CardContent className="pt-4">
          {notEnoughHistory ? (
            <EmptyState
              title={t('dashboard.principal.notEnoughHistoryTitle')}
              description={subline}
            />
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-foreground">{headline}</span>
                <span className="text-xs text-muted-foreground">{subline}</span>
              </div>
              <div className="mt-3 flex h-16 items-end gap-1.5">
                {points.map((point) => (
                  <div key={point.label} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-green-600 dark:bg-green-500"
                      style={{ height: `${Math.max(point.pct ?? 0, 4)}%` }}
                    />
                    <span className="text-[10px] text-muted-foreground">{point.label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
