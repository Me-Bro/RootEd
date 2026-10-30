import { Card, CardContent } from '@/components/ui/Card.jsx';
import { Progress, ProgressTrack, ProgressIndicator } from '@/components/ui/progress.jsx';
import { cn } from '@/lib/utils';

const TONE_INDICATOR = {
  good: 'bg-green-600 dark:bg-green-500',
  warn: 'bg-yellow-500',
  bad: 'bg-destructive',
};

// A KPI card doubles as the "exact number" and the "colour-coded glance"
// from the mock's two separate sections — one Progress bar tinted by tone
// gets both jobs done instead of duplicating the same 4 numbers twice.
export default function KpiCard({ label, valueLabel, percent, tone = 'good', onTap }) {
  const content = (
    <CardContent className="pt-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold text-foreground">{valueLabel}</p>
      <Progress value={percent} className="mt-2">
        <ProgressTrack>
          <ProgressIndicator className={cn(TONE_INDICATOR[tone] ?? TONE_INDICATOR.good)} />
        </ProgressTrack>
      </Progress>
    </CardContent>
  );

  if (!onTap) return <Card>{content}</Card>;

  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full text-left transition-opacity hover:opacity-80"
    >
      <Card>{content}</Card>
    </button>
  );
}
