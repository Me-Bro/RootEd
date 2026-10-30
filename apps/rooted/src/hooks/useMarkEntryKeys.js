import { useEffect, useRef } from 'react';

const DIGIT = /^[0-9]$/;

/**
 * Physical-keyboard driver for the grades roster.
 *
 * `DockedKeypad` exists because the OS soft keyboard covers ~45% of a phone
 * screen and hides the roster it's editing — a trade-off that simply doesn't
 * apply to anyone holding real keys. So the same four actions are bound
 * globally here instead of living only behind the on-screen grid, and the grid
 * itself becomes a small-viewport affordance.
 *
 * Mounted on every viewport rather than gated on a breakpoint: a tablet with a
 * keyboard case, or a Windows touch laptop, legitimately has both input
 * methods at once. This is additive — no existing tap flow changes.
 *
 * Bindings: digits type into the draft, `Backspace` deletes, `A` marks absent,
 * `Enter` commits and advances, `↑`/`↓` move the focused row, `Esc` clears the
 * draft.
 */
export function useMarkEntryKeys({ enabled, onKey, onNext, onMove, onClear }) {
  // Callbacks are re-created on every GradesPage render; parking them in a ref
  // keeps the listener subscribed once per `enabled` flip instead of once per
  // keystroke-triggered re-render of a 100-row roster.
  const handlers = useRef({ onKey, onNext, onMove, onClear });
  useEffect(() => {
    handlers.current = { onKey, onNext, onMove, onClear };
  });

  useEffect(() => {
    if (!enabled) return undefined;

    function handleKeyDown(event) {
      // Leave browser/OS shortcuts (Ctrl+R, Cmd+L, …) alone.
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      // An open chip picker owns the keyboard while it's up — Base UI menus use
      // letter typeahead and arrow navigation, so swallowing those here would
      // break section/term/subject selection.
      if (document.querySelector('[role="menu"],[role="dialog"]')) return;

      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        (active.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName))
      ) {
        return;
      }

      const { onKey: key_, onNext: next_, onMove: move_, onClear: clear_ } = handlers.current;
      const { key } = event;

      if (DIGIT.test(key)) key_(key);
      else if (key === 'Backspace') key_('⌫');
      else if (key === 'a' || key === 'A') key_('AB');
      else if (key === 'Enter') next_();
      else if (key === 'ArrowDown') move_(1);
      else if (key === 'ArrowUp') move_(-1);
      else if (key === 'Escape') clear_();
      else return;

      // Enter would otherwise also re-activate whichever MarkRow button holds
      // DOM focus, Backspace can navigate back, and the arrows would scroll the
      // roster out from under the row we just moved to.
      event.preventDefault();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}
