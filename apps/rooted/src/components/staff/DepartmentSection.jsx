import { Link } from 'react-router-dom';
import { Badge } from '../ui/Badge.jsx';

function initials(firstName, lastName) {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();
}

function statusVariant(status) {
  if (status === 'active') return 'success';
  if (status === 'on_leave') return 'warning';
  if (status === 'resigned' || status === 'terminated') return 'danger';
  return 'default';
}

/**
 * One department's worth of staff rows (§4 component contract: { department, members }).
 * `department` is optional — when omitted (the flat search-result case, §5 "search
 * bypasses grouping"), the section renders with no heading, just the row list.
 */
export default function DepartmentSection({ department, members }) {
  return (
    <div className="flex flex-col gap-2">
      {department && (
        <p className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {department} · {members.length}
        </p>
      )}
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {members.map((m) => (
          <Link
            key={m._id}
            to={`/staff/${m._id}`}
            className="flex items-center gap-3 p-3 hover:bg-muted"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
              {initials(m.firstName, m.lastName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {m.firstName} {m.lastName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {m.employeeId || '—'}
                {m.designation ? ` · ${m.designation}` : ''}
              </p>
            </div>
            <Badge variant={statusVariant(m.employmentStatus)}>{m.employmentStatus}</Badge>
          </Link>
        ))}
      </div>
    </div>
  );
}
