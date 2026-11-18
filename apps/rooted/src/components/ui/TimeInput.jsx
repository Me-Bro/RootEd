import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input as InputPrimitive } from '@base-ui/react/input';

import { cn } from '@/lib/utils';
import { fromParts, maskTime, toParts } from '@/utils/time12.js';

// A time field read as hh:mm plus an AM/PM choice, whatever the browser or OS clock setting
// (a native time input follows the OS and shows 24-hour on many desktops). The value in and
// out is the 24-hour `HH:mm` string a native time input uses (or ''), so callers keep their
// state, validation schemas and API payloads unchanged.

function TimeInput({ value, onChange, name, id, className, disabled, ...props }) {
  const { t } = useTranslation();
  const ref = useRef(null);
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

  return (
    <div className="flex gap-2">
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
        className={className}
        value={text}
        onChange={(e) => {
          const next = maskTime(e.target.value);
          setText(next);
          emit(next, period);
        }}
      />
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
