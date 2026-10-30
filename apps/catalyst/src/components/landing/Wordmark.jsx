import { useTranslation } from 'react-i18next';

/** Text wordmark with a small rising-bars mark. No image asset to load or to go stale. */
export function Wordmark() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-2">
      <svg viewBox="0 0 24 24" className="size-6 text-primary" aria-hidden="true" fill="none">
        <rect x="2" y="13" width="5" height="9" rx="1.5" fill="currentColor" opacity="0.45" />
        <rect x="9.5" y="8" width="5" height="14" rx="1.5" fill="currentColor" opacity="0.7" />
        <rect x="17" y="2" width="5" height="20" rx="1.5" fill="currentColor" />
      </svg>
      <span className="text-base font-semibold tracking-tight">{t('portal.brand')}</span>
    </span>
  );
}
