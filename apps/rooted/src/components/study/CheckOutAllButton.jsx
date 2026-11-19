import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button.jsx';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog.jsx';

/**
 * The owner's end-of-day button: check out everyone still inside, after a confirm.
 * The dialog stays open with an inline error if the request fails.
 */
export default function CheckOutAllButton({ count, isPending, error, onConfirm }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" disabled={count === 0} onClick={() => setOpen(true)}>
        {t('studyCenter.desk.checkOutAll')}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('studyCenter.desk.checkOutAllTitle', { count })}</AlertDialogTitle>
            <AlertDialogDescription>{t('studyCenter.desk.checkOutAllBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={async () => {
                if (await onConfirm()) setOpen(false);
              }}
            >
              {t('studyCenter.desk.checkOutAllConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
