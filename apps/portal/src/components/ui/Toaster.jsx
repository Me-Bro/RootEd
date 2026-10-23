import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { dismissToast, getToasts, subscribe } from '@/lib/toast.js';

/**
 * Renders the toast store. A success is announced politely (role=status), an
 * error assertively (role=alert). Nothing is rendered while there are none, so
 * the page has no stray live regions.
 */
export function Toaster() {
  const { t } = useTranslation();
  const toasts = useSyncExternalStore(subscribe, getToasts);
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2">
      {toasts.map(({ id, message, variant }) => (
        <div
          key={id}
          role={variant === 'error' ? 'alert' : 'status'}
          data-testid={`toast-${variant}`}
          className={cn(
            'pointer-events-auto flex max-w-sm items-start gap-3 rounded-lg border px-3 py-2 text-sm shadow-lg',
            variant === 'error'
              ? 'border-destructive bg-card text-destructive'
              : 'border-border bg-card text-foreground'
          )}
        >
          <span className="flex-1">{message}</span>
          <button
            type="button"
            onClick={() => dismissToast(id)}
            aria-label={t('common.close')}
            className="rounded p-0.5 hover:bg-muted"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
