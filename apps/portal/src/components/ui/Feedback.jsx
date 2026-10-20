import { InboxIcon, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export function EmptyState({ icon: Icon = InboxIcon, title, description, action, className }) {
  const { t } = useTranslation();
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 py-12 text-center', className)}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-muted">
        <Icon size={20} className="text-muted-foreground" aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-medium">{title ?? t('common.noData')}</p>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ label }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 py-10 text-muted-foreground"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span>{label ?? t('common.loading')}</span>
    </div>
  );
}

export function ErrorNote({ error, onRetry }) {
  const { t } = useTranslation();
  const message = error?.response?.data?.error || t('common.error');
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-2 rounded-lg bg-destructive/10 p-3 text-destructive"
    >
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="text-xs font-medium underline">
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

/** A horizontal bar for a 0-100 value. `value` null renders an empty track. */
export function Meter({ value, label, className }) {
  const clamped = value === null || value === undefined ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value ?? undefined}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div className="h-full rounded-full bg-primary" style={{ width: `${clamped}%` }} />
    </div>
  );
}
