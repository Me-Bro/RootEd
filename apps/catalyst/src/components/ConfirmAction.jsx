import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button.jsx';

/**
 * A button that asks first. The first click only arms it; nothing is sent until
 * the second, so a stray click cannot suspend or remove someone.
 */
export function ConfirmAction({
  label,
  confirmLabel,
  ariaLabel,
  confirmAriaLabel,
  onConfirm,
  pending = false,
  variant = 'destructive',
}) {
  const { t } = useTranslation();
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <Button size="sm" variant="outline" aria-label={ariaLabel} onClick={() => setArmed(true)}>
        {label}
      </Button>
    );
  }
  return (
    <span className="inline-flex gap-1">
      <Button
        size="sm"
        variant={variant}
        aria-label={confirmAriaLabel}
        disabled={pending}
        onClick={() => {
          onConfirm();
          setArmed(false);
        }}
      >
        {confirmLabel}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setArmed(false)}>
        {t('common.cancel')}
      </Button>
    </span>
  );
}
