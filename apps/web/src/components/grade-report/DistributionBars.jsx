import { cn } from '../../lib/utils.js';

const LETTERS = ['A', 'B', 'C', 'D', 'F'];

const BAR_COLOR = {
  A: 'bg-green-500 dark:bg-green-600',
  B: 'bg-green-400 dark:bg-green-500',
  C: 'bg-gray-400 dark:bg-gray-500',
  D: 'bg-amber-400 dark:bg-amber-500',
  F: 'bg-red-500 dark:bg-red-600',
};

/**
 * Grade distribution chart that doubles as the student-list filter — tapping
 * a band reports it to the caller via onSelectBand; toggling the already-active
 * band off (clearing the filter) is the caller's responsibility, matching the
 * `bandFilter` state owned by GradeReportPage.
 */
export default function DistributionBars({ distribution, activeFilter, onSelectBand }) {
  const counts = LETTERS.map((letter) => distribution?.[letter] ?? 0);
  const max = Math.max(...counts, 1);

  return (
    <div
      className="flex items-end gap-2"
      role="group"
      aria-label="Grade distribution — tap a bar to filter the student list"
    >
      {LETTERS.map((letter, i) => {
        const count = counts[i];
        const active = activeFilter === letter;
        const heightPct = (count / max) * 100;

        return (
          <button
            key={letter}
            type="button"
            aria-pressed={active}
            aria-label={`Grade ${letter}: ${count} student${count === 1 ? '' : 's'}`}
            onClick={() => onSelectBand(letter)}
            className={cn(
              'flex flex-1 flex-col items-center gap-1.5 rounded-md py-1 transition-colors',
              active ? 'bg-muted ring-2 ring-primary' : 'hover:bg-muted/60'
            )}
          >
            <span className="text-xs font-semibold text-muted-foreground">{count}</span>
            <div className="flex h-16 w-full items-end">
              <div
                className={cn('w-full rounded-t-md', BAR_COLOR[letter])}
                style={{ height: `${heightPct}%` }}
              />
            </div>
            <span className="text-xs font-medium text-foreground">{letter}</span>
          </button>
        );
      })}
    </div>
  );
}
