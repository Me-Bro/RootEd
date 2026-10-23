import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bell } from 'lucide-react';
import api from '@/lib/api.js';
import { fmtDate } from '@/lib/format.js';
import { Button } from '@/components/ui/Button.jsx';

const KEY = ['notifications'];

/**
 * Unread notices for the signed-in user. Polled once a minute, like the main
 * app's bell. The notice text is written by the API (in English); only this
 * chrome is translated.
 */
export function NotificationBell() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: notices = [] } = useQuery({
    queryKey: KEY,
    queryFn: () => api.get('/tenant/notifications').then((r) => r.data),
    refetchInterval: 60_000,
  });

  const markAllRead = useMutation({
    mutationFn: () =>
      Promise.all(notices.map((n) => api.patch(`/tenant/notifications/${n._id}/read`))),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });

  return (
    <div className="relative" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-label={t('notifications.label', { count: notices.length })}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="size-4" aria-hidden="true" />
        {notices.length > 0 && (
          <span
            data-testid="notification-count"
            className="rounded-full bg-destructive px-1.5 text-[10px] font-bold text-white"
          >
            {notices.length > 9 ? '9+' : notices.length}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded-lg border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold">{t('notifications.title')}</span>
            {notices.length > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                className="text-xs text-primary hover:underline"
              >
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {notices.slice(0, 10).map((n) => (
              <li key={n._id} className="px-3 py-2">
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.body}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {fmtDate(n.createdAt, i18n.language)}
                </p>
              </li>
            ))}
            {notices.length === 0 && (
              <li className="px-3 py-5 text-center text-sm text-muted-foreground">
                {t('notifications.none')}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
