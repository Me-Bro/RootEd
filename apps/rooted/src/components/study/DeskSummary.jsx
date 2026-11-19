import { useTranslation } from 'react-i18next';
import { Badge } from '../ui/Badge.jsx';
import { Card, CardContent } from '../ui/Card.jsx';

function Figure({ label, value, testId }) {
  return (
    <div className="flex flex-col" data-testid={testId}>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

/** The strip at the top of the desk: who is in, free seats, today's check-ins, open or closed. */
export default function DeskSummary({ summary }) {
  const { t } = useTranslation();
  if (!summary) return null;

  const hours = summary.open24h
    ? t('studyCenter.desk.open24h')
    : t('studyCenter.desk.hours', { from: summary.openTime, to: summary.closeTime });

  return (
    <Card data-testid="desk-summary">
      <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 pt-4">
        <Figure
          label={t('studyCenter.desk.statInside')}
          value={summary.insideNow}
          testId="stat-inside"
        />
        <Figure
          label={t('studyCenter.desk.statFree', { total: summary.seatsActive })}
          value={summary.freeSeats}
          testId="stat-free"
        />
        <Figure
          label={t('studyCenter.desk.statToday')}
          value={summary.checkInsToday}
          testId="stat-today"
        />
        <div className="ml-auto flex flex-col items-end gap-1">
          <Badge variant={summary.openNow ? 'success' : 'warning'}>
            {summary.openNow ? t('studyCenter.desk.openNow') : t('studyCenter.desk.closedNow')}
          </Badge>
          <span className="text-xs text-muted-foreground">{hours}</span>
        </div>
      </CardContent>
    </Card>
  );
}
