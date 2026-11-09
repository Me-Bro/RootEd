import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';

/** A load that failed, with a way to try again. Never dressed up as empty data. */
export function LoadError({ onRetry, className }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className={`flex flex-col items-center gap-2 text-center text-sm ${className ?? ''}`}
    >
      <p className="text-destructive">{t('common.loadFailed')}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={() => onRetry()}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}
