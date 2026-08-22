import { cn } from '../../lib/utils.js';
import { Button } from '../ui/Button.jsx';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'AB', '0', '⌫'];

/**
 * Docked, custom numeric keypad for entering a mark against whichever student
 * row is currently focused. Deliberately not the OS number keyboard (see
 * docs/mobile-ui/05-grades-approved.html) — the OS keyboard covers ~45% of a
 * phone screen and hides the roster it's editing.
 *
 * `onKey` handles digits, backspace ('⌫'), and 'AB' (absent for this one
 * assessment — commits immediately, no need to hit Next). `onNext` commits
 * whatever digits are in `value` and advances to the next unmarked student.
 */
export default function DockedKeypad({ value, onKey, onNext, disabled = false }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-1.5">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onKey(key)}
            aria-label={key === 'AB' ? 'Mark absent' : key === '⌫' ? 'Backspace' : `Digit ${key}`}
            className={cn(
              'h-11 rounded-md border text-base font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40',
              key === 'AB' || key === '⌫'
                ? 'border-border bg-muted text-muted-foreground hover:bg-muted/70'
                : 'border-border bg-background hover:bg-muted'
            )}
          >
            {key}
          </button>
        ))}
      </div>
      <Button className="h-11" onClick={onNext} disabled={disabled || !value}>
        Next student ›
      </Button>
    </div>
  );
}
