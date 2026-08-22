import { ChevronDown } from 'lucide-react';
import { Card, CardContent } from '../ui/Card.jsx';
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';
import { cn } from '../../lib/utils.js';
import TermRow from './TermRow.jsx';

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// Pure date-range check — the term containing today is "current". No new
// field on the term, computed fresh on every render.
function isCurrentTerm(term) {
  const today = new Date();
  return today >= new Date(term.startDate) && today <= new Date(term.endDate);
}

// `terms` and `onAddTerm` aren't in the spec's literal component-contract
// table (§4), but the card is what renders the term list / count and hosts
// the "+ Add a term" trigger, so it needs both — see build report.
export default function YearCard({
  year,
  terms,
  expanded,
  onToggle,
  onSetActive,
  onAddTerm,
  canWrite,
}) {
  return (
    <Card className={year.isActive ? 'ring-2 ring-primary/40' : undefined}>
      <CardContent>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold">{year.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatDate(year.startDate)} – {formatDate(year.endDate)}
            </p>
          </div>

          {year.isActive ? (
            <Badge variant="success">● Active</Badge>
          ) : (
            <div className="flex shrink-0 items-center gap-2">
              {canWrite && (
                <Button size="sm" variant="outline" onClick={onSetActive}>
                  Set active
                </Button>
              )}
              <button
                type="button"
                aria-expanded={expanded}
                onClick={onToggle}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {terms.length} term{terms.length === 1 ? '' : 's'}
                <ChevronDown
                  size={14}
                  className={cn('transition-transform', expanded && 'rotate-180')}
                />
              </button>
            </div>
          )}
        </div>

        {expanded && (
          <div className="mt-3 flex flex-col gap-2">
            {terms.length === 0 ? (
              <p className="text-sm text-muted-foreground">No terms yet</p>
            ) : (
              terms.map((term) => (
                <TermRow key={term._id} term={term} isCurrent={isCurrentTerm(term)} />
              ))
            )}
            {canWrite && (
              <button
                type="button"
                onClick={onAddTerm}
                className="rounded-lg border border-dashed border-border px-3 py-2 text-left text-sm text-muted-foreground hover:border-primary hover:text-primary"
              >
                + Add a term
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
