import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils.js';

const FILTER_KEYS = ['all', 'unmarked', 'atRisk'];

export default function FilterChips({ value, onChange, counts }) {
  const { t } = useTranslation();
  const FILTERS = FILTER_KEYS.map((key) => ({
    key,
    label: t(`academic.attendance.filter.${key}`),
  }));

  return (
    <div
      className="flex flex-wrap gap-1.5"
      role="group"
      aria-label={t('academic.attendance.filterAriaLabel')}
    >
      {FILTERS.map(({ key, label }) => {
        const count = counts[key] ?? 0;
        const disabled = key === 'unmarked' && count === 0;
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            aria-pressed={value === key}
            onClick={() => onChange(key)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40',
              value === key
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted'
            )}
          >
            {label} · {count}
          </button>
        );
      })}
    </div>
  );
}
