import { MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils.js';

const PILL_STYLES = {
  present:
    'border-green-300 bg-green-100 text-green-800 dark:border-green-800 dark:bg-green-900/40 dark:text-green-200',
  absent:
    'border-red-300 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-900/40 dark:text-red-200',
};

function Pill({ active, tone, onClick, children, ariaLabel }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        'flex h-9 flex-1 items-center justify-center rounded-md border text-sm font-semibold transition-colors',
        active ? PILL_STYLES[tone] : 'border-border text-muted-foreground hover:bg-muted'
      )}
    >
      {children}
    </button>
  );
}

export default function StatusPills({ status, onSet, onOpenMore }) {
  const { t } = useTranslation();
  const isOverflowStatus = status === 'late' || status === 'excused';

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex flex-1 gap-1.5">
        <Pill
          active={status === 'present'}
          tone="present"
          ariaLabel={t('academic.attendance.markPresentAria')}
          onClick={() => onSet('present')}
        >
          P
        </Pill>
        <Pill
          active={status === 'absent'}
          tone="absent"
          ariaLabel={t('academic.attendance.markAbsentAria')}
          onClick={() => onSet('absent')}
        >
          A
        </Pill>
      </div>
      <button
        type="button"
        onClick={onOpenMore}
        aria-label={t('academic.attendance.moreStatusOptionsAria')}
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted',
          isOverflowStatus ? 'border-amber-400 text-amber-700 dark:text-amber-300' : 'border-border'
        )}
      >
        {isOverflowStatus ? status === 'late' ? 'L' : 'E' : <MoreHorizontal size={16} />}
      </button>
    </div>
  );
}
