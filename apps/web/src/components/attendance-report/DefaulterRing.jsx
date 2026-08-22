import { cn } from '../../lib/utils.js';

/**
 * Above-the-fold summary: class average as a ring + how many students need a
 * call today. Sort order (worst-first) and the defaulter count itself come
 * from the caller — this component only renders what it's given.
 */
export default function DefaulterRing({ classAveragePct, thresholdPct, defaulterCount }) {
  const hasData = classAveragePct !== null && classAveragePct !== undefined;
  const ringPct = hasData ? classAveragePct : 0;
  const message =
    defaulterCount === 0
      ? `0 below ${thresholdPct}% — nobody to call today`
      : `${defaulterCount} below ${thresholdPct}%`;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
      <div
        className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
        style={{
          background: `conic-gradient(var(--primary) ${ringPct}%, var(--border) 0)`,
        }}
        role="img"
        aria-label={hasData ? `Class average ${classAveragePct}%` : 'No attendance records yet'}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-card text-sm font-bold text-foreground">
          {hasData ? `${classAveragePct}%` : '—'}
        </div>
      </div>
      <div className="min-w-0">
        <p
          className={cn(
            'text-sm font-semibold',
            defaulterCount > 0 ? 'text-destructive' : 'text-foreground'
          )}
        >
          {message}
        </p>
        <p className="text-xs text-muted-foreground">
          Sorted worst first · threshold {thresholdPct}%
        </p>
      </div>
    </div>
  );
}
