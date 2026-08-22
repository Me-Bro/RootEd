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
  return (
    <AlertDialog open={Boolean(year)} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Set &quot;{year?.name}&quot; as the active year?</AlertDialogTitle>
          <AlertDialogDescription>
            Every other screen — Grades, Timetable, Fees, Report Cards — switches to this year as
            its default immediately.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p className="text-sm text-destructive">
            Failed to activate — check your connection and retry.
          </p>
        )}
        <AlertDialogFooter>
          {/* A plain Close — dismissing it fires the Root's onOpenChange(false)
              above, which already calls onCancel(). No separate onClick needed. */}
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Activating…' : error ? 'Retry' : 'Set active'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
