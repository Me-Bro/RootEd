import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fmtPct } from '@/lib/format.js';
import { ITEM_TYPES } from '@/lib/roadmap.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card.jsx';
import { Meter } from '@/components/ui/Feedback.jsx';

/** A student's own roadmap progress: overall, and by item type. */
export function ProgressSummary({ summary }) {
  const { t } = useTranslation();
  return (
    <Card data-testid="roadmap-summary">
      <CardHeader>
        <CardTitle as="h2">{t('myRoadmap.progressTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-3xl font-semibold tracking-tight" data-testid="summary-pct">
          {fmtPct(summary.pct)}
        </p>
        <Meter value={summary.pct} label={t('myRoadmap.progressTitle')} />
        <p className="text-sm text-muted-foreground" data-testid="summary-count">
          {summary.total === 0
            ? t('myRoadmap.noItems')
            : t('myRoadmap.progressOf', { completed: summary.completed, total: summary.total })}
        </p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {ITEM_TYPES.filter((type) => summary.byType[type].total > 0).map((type) => (
            <li key={type}>
              {t('myRoadmap.typeCount', {
                type: t(`roadmap.types.${type}`),
                completed: summary.byType[type].completed,
                total: summary.byType[type].total,
              })}
            </li>
          ))}
        </ul>
        <Link className="w-fit text-sm text-primary underline" to="/me/leaderboard">
          {t('myRoadmap.viewLeaderboard')}
        </Link>
      </CardContent>
    </Card>
  );
}
