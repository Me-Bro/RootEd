import { Link } from 'react-router-dom';
import { Phone, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils.js';

function initials(firstName, lastName) {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();
}

/**
 * One roster row. Defaulters get an actionable Call chip (or "Add contact"
 * when there's no guardian phone on file, so the tap is never a dead end);
 * everyone else just shows their attendance, no call action to take.
 */
export default function CallRow({ student, onCall }) {
  const { t } = useTranslation();
  const { firstName, lastName, admissionNo, presentCount, totalCount, pct, isDefaulter } = student;
  const hasPhone = Boolean(student.guardianPhone);

  return (
    <div className={cn('flex items-center gap-3 p-3', isDefaulter && 'bg-destructive/5')}>
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
          isDefaulter ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground'
        )}
      >
        {initials(firstName, lastName)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {firstName} {lastName}
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="font-mono">{admissionNo}</span>
          {' · '}
          {presentCount}/{totalCount}
          {' · '}
          {pct === null ? t('academic.attendanceReport.noHistory') : `${pct}%`}
        </p>
      </div>

      {isDefaulter ? (
        hasPhone ? (
          <button
            type="button"
            onClick={() => onCall(student)}
            className="flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20"
          >
            <Phone size={13} />
            {t('academic.attendanceReport.call')}
          </button>
        ) : (
          <Link
            to={`/academic/students/${student.studentId}`}
            className="shrink-0 text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            {t('academic.attendanceReport.addContact')}
          </Link>
        )
      ) : (
        <ChevronRight size={16} className="shrink-0 text-muted-foreground/50" aria-hidden="true" />
      )}
    </div>
  );
}
