import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet.jsx';
import { Button } from '../ui/Button.jsx';
import { cn } from '../../lib/utils.js';

function QuickPill({ active, tone, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-8 flex-1 rounded-md border text-xs font-semibold transition-colors',
        active
          ? tone === 'present'
            ? 'border-green-300 bg-green-100 text-green-800 dark:border-green-800 dark:bg-green-900/40 dark:text-green-200'
            : 'border-red-300 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-900/40 dark:text-red-200'
          : 'border-border text-muted-foreground hover:bg-muted'
      )}
    >
      {children}
    </button>
  );
}

export default function UnmarkedGuardSheet({
  open,
  unmarkedRows,
  onSet,
  onMarkAllPresent,
  onClose,
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{unmarkedRows.length} students still unmarked</SheetTitle>
          <SheetDescription>
            Nothing is assumed for these — choose Present or Absent, or mark the rest present in one
            tap.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-2 px-4">
          {unmarkedRows.map((r) => (
            <div key={r.studentId} className="flex items-center gap-3">
              <span className="flex-1 truncate text-sm font-medium">
                {r.firstName} {r.lastName}
              </span>
              <div className="flex w-28 gap-1.5">
                <QuickPill
                  active={r.current?.status === 'present'}
                  tone="present"
                  onClick={() => onSet(r.studentId, 'present')}
                >
                  P
                </QuickPill>
                <QuickPill
                  active={r.current?.status === 'absent'}
                  tone="absent"
                  onClick={() => onSet(r.studentId, 'absent')}
                >
                  A
                </QuickPill>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2 px-4 pb-4">
          <Button onClick={onMarkAllPresent}>⚡ Mark all {unmarkedRows.length} present</Button>
          <Button variant="outline" onClick={onClose}>
            Keep marking manually
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
