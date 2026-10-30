import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export default function BulkUndoToast({ count, onUndo, onExpire }) {
  const { t } = useTranslation();
  useEffect(() => {
    const id = setTimeout(onExpire, 5000);
    return () => clearTimeout(id);
  }, [onExpire]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-lg"
    >
      <span>
        <b>{count}</b> {t('academic.attendance.markedPresentSuffix', { count })}
      </span>
      <button type="button" onClick={onUndo} className="font-semibold text-primary hover:underline">
        {t('academic.attendance.undo')}
      </button>
    </div>
  );
}
