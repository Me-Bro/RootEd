import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils.js';
import SectionChips from './SectionChips.jsx';
import RosterInfiniteList from './RosterInfiniteList.jsx';

/**
 * Replaces the desktop's 40-option <select> for browsing students by class.
 * Renders every class as a tappable row; tapping expands that row in place
 * (accordion) to show its <SectionChips> — and, once a section is picked,
 * that section's roster — directly underneath. Both live inside the same
 * expand/collapse panel as the row itself, so collapsing the row hides them
 * too, rather than leaving a roster stranded on screen after its class closes.
 * activeSectionId only ever belongs to the currently-expanded class (the
 * parent clears it when switching to a different class — see
 * StudentsPage's handleExpandClass), so gating the roster on it here is safe.
 */
export default function ClassGrid({
  classes,
  expandedId,
  onExpand,
  activeSectionId,
  onSelectSection,
}) {
  const { t } = useTranslation();
  if (!classes.length) return null;

  return (
    <div
      className="flex flex-col gap-1.5"
      role="list"
      aria-label={t('academic.students.classesAriaLabel')}
    >
      {classes.map((c) => {
        const isExpanded = c._id === expandedId;
        const sectionCount = (c.sections || []).length;
        return (
          <div key={c._id} role="listitem">
            <button
              type="button"
              aria-expanded={isExpanded}
              onClick={() => onExpand(c._id)}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                isExpanded
                  ? 'rounded-b-none border-primary bg-primary/5'
                  : 'border-border bg-card hover:bg-muted'
              )}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  {c.gradeLevel ?? c.name?.[0]}
                </span>
                <div>
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('academic.students.sectionCount', { count: sectionCount })}
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
            {isExpanded && (
              <div className="rounded-b-lg border border-t-0 border-primary bg-primary/5 p-2.5">
                <SectionChips
                  sections={c.sections || []}
                  activeId={activeSectionId}
                  onSelect={onSelectSection}
                />
                {activeSectionId && (
                  <div className="mt-3">
                    <RosterInfiniteList sectionId={activeSectionId} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
