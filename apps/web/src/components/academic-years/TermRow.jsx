import { Badge } from '../ui/Badge.jsx';

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// Presentational only — isCurrent is computed by the caller (pure date-range
// math against `term.startDate`/`endDate`, no new field on the term itself).
export default function TermRow({ term, isCurrent }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{term.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatDate(term.startDate)} – {formatDate(term.endDate)}
        </p>
      </div>
      {isCurrent && <Badge variant="success">current</Badge>}
    </div>
  );
}
