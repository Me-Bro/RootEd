import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card.jsx';
import { Badge } from '@/components/ui/Badge.jsx';
import { Meter } from '@/components/ui/Feedback.jsx';
import { fmtPct } from '@/lib/format.js';

/**
 * One pilot target: the figure, the target, and whether it is met. With no data
 * it says so, rather than showing 0% as if it had been measured.
 */
export function MetricCard({ id, title, metric, detail }) {
  const { t } = useTranslation();
  const noData = metric.pct === null || metric.pct === undefined;
  const status = noData ? 'noData' : metric.met ? 'met' : 'notMet';
  const variant = { noData: 'default', met: 'success', notMet: 'warning' }[status];

  return (
    <Card data-testid={`metric-${id}`}>
      <CardHeader>
        <CardTitle as="h3" className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-3xl font-semibold tracking-tight" data-testid={`metric-${id}-value`}>
          {fmtPct(metric.pct)}
        </p>
        <Meter value={metric.pct} label={title} />
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{t('training.dashboard.target', { target: metric.target })}</span>
          <Badge variant={variant}>{t(`training.dashboard.${status}`)}</Badge>
        </div>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </CardContent>
    </Card>
  );
}
