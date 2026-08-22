import { cn } from '../../lib/utils.js';

/**
 * Circular progress indicator for a report-card generation batch.
 *
 * Shows the real completed/total count reported by the BullMQ job's progress
 * (see reportCard.worker.js), not a spinner guessing how far along things are —
 * docs/mobile-ui/09-report-cards-approved.html §1/§4/§6.
 */
export default function ProgressRing({ completed, total, size = 110, className }) {
  const known = Number.isFinite(total) && total > 0;
  const pct = known ? Math.max(0, Math.min(100, Math.round((completed / total) * 100))) : 0;

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={known ? total : undefined}
      aria-valuenow={known ? completed : undefined}
      aria-label={
        known ? `${completed} of ${total} report cards built` : 'Report card generation starting'
      }
      className={cn('relative mx-auto grid shrink-0 place-items-center rounded-full', className)}
      style={{
        width: size,
        height: size,
        background: `conic-gradient(var(--primary) ${pct}%, var(--muted) 0)`,
      }}
    >
      <div className="absolute inset-[10px] rounded-full bg-card" />
      <div className="relative z-10 text-center leading-tight">
        <div className="text-2xl font-bold tabular-nums">{known ? completed : '—'}</div>
        <div className="text-xs text-muted-foreground">{known ? `of ${total}` : 'starting…'}</div>
      </div>
    </div>
  );
}
