import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const TONE_CLASSES = {
  bad: 'border-destructive/30 bg-destructive/5 hover:bg-destructive/10 text-destructive',
  warn: 'border-yellow-300 bg-yellow-50 hover:bg-yellow-100 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:hover:bg-yellow-900/30 dark:text-yellow-400',
};

// Same convention as inventory/AttentionStrip.jsx: hides an item whose count
// is 0, hides entirely when every item is 0 — nothing to draw attention to.
export default function PrincipalAttentionStrip({ items }) {
  const { t } = useTranslation();
  const visible = items.filter((item) => item.count > 0);
  if (visible.length === 0) return null;

  return (
    <div
      className="flex flex-col gap-2"
      role="group"
      aria-label={t('dashboard.principal.attentionAriaLabel')}
    >
      {visible.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={item.onTap}
          className={cn(
            'flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors',
            TONE_CLASSES[item.tone] ?? TONE_CLASSES.warn
          )}
        >
          <span>
            <span className="mr-1.5 text-lg font-semibold">{item.count}</span>
            <span className="text-sm">{t(item.labelKey, { count: item.count })}</span>
            {item.meta && <span className="ml-1.5 text-xs opacity-75">{item.meta}</span>}
          </span>
          <span aria-hidden="true">›</span>
        </button>
      ))}
    </div>
  );
}
