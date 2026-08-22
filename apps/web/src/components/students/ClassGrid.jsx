import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils.js';

/**
 * Replaces the desktop's 40-option <select> for browsing students by class.
 * Renders every class as a tappable row; tapping toggles which class's
 * sections (rendered by <SectionChips> in the parent) are shown below it.
 */
export default function ClassGrid({ classes, expandedId, onExpand }) {
  if (!classes.length) return null;

  return (
    <div className="flex flex-col gap-1.5" role="list" aria-label="Classes">
      {classes.map((c) => {
        const isExpanded = c._id === expandedId;
        const sectionCount = (c.sections || []).length;
        return (
          <button
            key={c._id}
            type="button"
            role="listitem"
            aria-expanded={isExpanded}
            onClick={() => onExpand(c._id)}
            className={cn(
              'flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
              isExpanded ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted'
            )}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                {c.gradeLevel ?? c.name?.[0]}
              </span>
              <div>
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {sectionCount} section{sectionCount === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <ChevronDown
              size={16}
              className={cn(
                'shrink-0 text-muted-foreground transition-transform',
                isExpanded && 'rotate-180'
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
