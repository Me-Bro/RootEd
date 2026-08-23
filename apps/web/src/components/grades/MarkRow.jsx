import { useTranslation } from 'react-i18next';
import { Badge } from '../ui/Badge.jsx';
import { cn } from '../../lib/utils.js';

function initials(firstName, lastName) {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();
}

const GRADE_VARIANT = {
  A: 'success',
  B: 'success',
  C: 'secondary',
  D: 'warning',
  F: 'danger',
};

/**
 * One roster row. `score` doubles as the committed value (number | null for
 * "AB" | undefined for not-yet-entered) when `focused` is false, and as the
 * live in-progress keypad draft (a string) when `focused` is true — the badge
 * always reflects the last *committed* letterGrade regardless of what's being
 * typed, matching the approved mock (a student mid-edit still shows their old
 * letter next to the new digits until Next commits them).
 *
 * `onSelect` (tap-to-jump to this row) is an addition beyond the spec's literal
 * 4-prop contract — without it there'd be no way to correct an earlier entry
 * before Save. Omit it (leave undefined) to render the row inert, e.g. while
 * grades are locked.
 */
export default function MarkRow({ student, score, letterGrade, focused, onSelect }) {
  const { t } = useTranslation();
  const isAbsent = score === null;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!onSelect}
      className={cn(
        'flex w-full items-center gap-3 border-l-2 p-3 text-left transition-colors disabled:cursor-default',
        focused ? 'border-primary bg-primary/5' : 'border-transparent',
        onSelect && !focused && 'hover:bg-muted'
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
        {initials(student.firstName, student.lastName)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {student.firstName} {student.lastName}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {student.admissionNo}
          {focused && (
            <span className="ml-1.5 font-medium text-primary">{t('academic.grades.typing')}</span>
          )}
        </p>
      </div>
      {isAbsent ? (
        <Badge variant="secondary">AB</Badge>
      ) : letterGrade ? (
        <Badge variant={GRADE_VARIANT[letterGrade] ?? 'secondary'}>{letterGrade}</Badge>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      )}
      <span
        className={cn(
          'w-11 shrink-0 text-right font-semibold tabular-nums',
          focused ? 'text-lg text-foreground' : 'text-sm',
          !focused && typeof score !== 'number' && !isAbsent && 'text-muted-foreground'
        )}
      >
        {focused ? (
          <>
            {score}
            <span className="opacity-40">_</span>
          </>
        ) : isAbsent ? (
          'AB'
        ) : typeof score === 'number' ? (
          score
        ) : (
          '··'
        )}
      </span>
    </button>
  );
}
