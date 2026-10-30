import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '../ui/alert-dialog.jsx';

// `isPending`/`error` aren't in the spec's literal { year, onConfirm, onCancel }
// contract, but the edge-case table requires the dialog to stay open with an
// inline error + Retry on a failed activate — see build report. AlertDialogAction
// is a plain Button (not a Close), so it never auto-dismisses on click; only the
// page setting `year` back to null (on mutation success) closes this dialog.
export default function ActivateConfirm({ year, isPending, error, onConfirm, onCancel }) {
  const { t } = useTranslation();
  return (
    <AlertDialog open={Boolean(year)} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('academic.years.activateConfirmTitle', { name: year?.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('academic.years.activateConfirmDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p className="text-sm text-destructive">{t('academic.years.activateFailedRetry')}</p>
        )}
        <AlertDialogFooter>
          {/* A plain Close — dismissing it fires the Root's onOpenChange(false)
              above, which already calls onCancel(). No separate onClick needed. */}
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isPending}>
            {isPending
              ? t('academic.years.activating')
              : error
                ? t('academic.years.retry')
                : t('academic.years.setActive')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
