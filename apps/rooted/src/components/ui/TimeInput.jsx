import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input as InputPrimitive } from '@base-ui/react/input';
import { Popover } from '@base-ui/react/popover';
import { Clock } from 'lucide-react';

import { cn } from '@/lib/utils';
import { TimeClock } from '@/components/ui/TimeClock';
import { fromParts, maskTime, toParts } from '@/utils/time12.js';

// A time field read as hh:mm plus an AM/PM choice, whatever the browser or OS clock setting
// (a native time input follows the OS and shows 24-hour on many desktops). The value in and
// out is the 24-hour `HH:mm` string a native time input uses (or ''), so callers keep their
// state, validation schemas and API payloads unchanged.

function TimeInput({ value, onChange, name, id, className, disabled, ...props }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const initial = toParts(value);
  const [text, setText] = useState(initial.text);
  const [period, setPeriod] = useState(initial.period ?? 'AM');
  const [seen, setSeen] = useState(value ?? '');

  // The parent changed the value (reset, cleared): show it. Typing round-trips through
  // onChange, so a value that still matches what is on screen is left alone.
  if ((value ?? '') !== seen) {
    setSeen(value ?? '');
    if ((value ?? '') !== fromParts(text, period)) {
      const next = toParts(value);
      setText(next.text);
      if (next.period) setPeriod(next.period);
    }
  }

  const problem = text && !fromParts(text, period) ? t('common.timeInvalid') : '';

  // Native form validation (`required`, submit blocking) reads this.
  useEffect(() => {
    ref.current?.setCustomValidity(problem);
  }, [problem]);

  function emit(nextText, nextPeriod) {
    onChange?.({ target: { value: fromParts(nextText, nextPeriod), name, id } });
  }

  // The clock reports a full 24-hour value; show it in the typed box and the AM/PM choice too.
  function pickFromClock(next) {
    const parts = toParts(next);
    setText(parts.text);
    setPeriod(parts.period ?? 'AM');
    emit(parts.text, parts.period ?? 'AM');
  }

  return (
    <div className="flex gap-2">
      <div ref={anchorRef} className="relative min-w-0 flex-1">
        <InputPrimitive
          {...props}
          ref={ref}
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={5}
          placeholder={props.placeholder ?? 'hh:mm'}
          disabled={disabled}
          className={cn(className, 'pr-9')}
          value={text}
          onChange={(e) => {
            const next = maskTime(e.target.value);
            setText(next);
            emit(next, period);
          }}
        />
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger
            type="button"
            disabled={disabled || props.readOnly}
            aria-label={t('common.clockOpen')}
            className="absolute inset-y-0 right-1 my-auto flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
          >
            <Clock className="size-4" />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner
              anchor={anchorRef}
              side="bottom"
              align="end"
              sideOffset={4}
              className="z-[70]"
            >
              <Popover.Popup className="rounded-lg bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none">
                {/* Remounts on each open so the lists start at the current value. */}
                <TimeClock
                  value={fromParts(text, period)}
                  onChange={pickFromClock}
                  onDone={() => {
                    setOpen(false);
                    ref.current?.focus();
                  }}
                />
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </div>
      <select
        aria-label={t('common.amPm')}
        value={period}
        disabled={disabled}
        onChange={(e) => {
          setPeriod(e.target.value);
          emit(text, e.target.value);
        }}
        className={cn(
          'h-9 shrink-0 rounded-lg border border-input bg-transparent px-2 text-base outline-none',
          'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm',
          'disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30'
        )}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

export { TimeInput };
