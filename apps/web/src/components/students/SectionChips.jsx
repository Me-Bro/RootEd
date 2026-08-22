import { cn } from '../../lib/utils.js';

/**
 * Second tap of the class drill-down: pick a section within the already
 * expanded class. Replaces the flat 40-option list item for the "section"
 * half of the old <select>.
 */
export default function SectionChips({ sections, activeId, onSelect }) {
  if (!sections.length) {
    return <p className="px-1 text-xs text-muted-foreground">No sections in this class yet.</p>;
  }

  const sorted = [...sections].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="grid grid-cols-4 gap-2" role="group" aria-label="Sections">
      {sorted.map((s) => {
        const active = s._id === activeId;
        return (
          <button
            key={s._id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(s._id)}
            className={cn(
              'rounded-full border px-2 py-1.5 text-center text-sm font-medium transition-colors',
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-foreground hover:bg-muted'
            )}
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
}
