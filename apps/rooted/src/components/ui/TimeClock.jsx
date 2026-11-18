import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { fromParts, toParts } from '@/utils/time12.js';

// A clock for TimeInput: an hour list (1-12), a minute list (5-minute steps) and an AM/PM
// choice. It works on the 24-hour `HH:mm` string a native time input uses, so it stays in
// step with TimeInput's own value. Each tap calls `onChange` straight away; "Done" closes.

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const pad = (n) => String(n).padStart(2, '0');

function TimeClock({ value, onChange, onDone }) {
  const { t } = useTranslation();
  const initial = toParts(value);
  // The clock keeps its own hour/minute/period so choosing an hour before a minute (with no
  // value yet) still builds a full time. Opens on the current value, or 8:00 AM.
  const [hour, setHour] = useState(initial.text ? Number(initial.text.slice(0, 2)) : null);
  const [minute, setMinute] = useState(initial.text ? Number(initial.text.slice(3, 5)) : null);
  const [period, setPeriod] = useState(initial.period ?? 'AM');
  const hoursRef = useRef(null);

  // Bring the chosen hour into view when the popover opens.
  useEffect(() => {
    hoursRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({ block: 'center' });
  }, []);

  function emit(h, m, p) {
    // Until both an hour and a minute exist there is no time to report.
    const next = h === null ? '' : fromParts(`${pad(h)}:${pad(m ?? 0)}`, p);
    if (next) onChange(next);
  }

  function pickHour(h) {
    const m = minute ?? 0;
    setHour(h);
    setMinute(m);
    emit(h, m, period);
  }

  function pickMinute(m) {
    const h = hour ?? 12;
    setMinute(m);
    setHour(h);
    emit(h, m, period);
  }

  function pickPeriod(p) {
    setPeriod(p);
    emit(hour, minute, p);
  }

  const itemClass = (on) =>
    cn(
      'flex h-8 w-full items-center justify-center rounded-md text-sm outline-none',
      'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50',
      on && 'bg-primary text-primary-foreground hover:bg-primary'
    );
  const listClass = 'flex max-h-56 w-14 flex-col gap-0.5 overflow-y-auto pr-0.5';

  return (
    <div className="select-none">
      <div className="flex gap-2">
        <div>
          <p className="mb-1 text-center text-xs text-muted-foreground">{t('common.clockHour')}</p>
          <div ref={hoursRef} role="group" aria-label={t('common.clockHour')} className={listClass}>
            {HOURS.map((h) => (
              <button
                key={h}
                type="button"
                aria-pressed={h === hour}
                onClick={() => pickHour(h)}
                className={itemClass(h === hour)}
              >
                {pad(h)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-center text-xs text-muted-foreground">
            {t('common.clockMinute')}
          </p>
          <div role="group" aria-label={t('common.clockMinute')} className={listClass}>
            {MINUTES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={m === minute}
                onClick={() => pickMinute(m)}
                className={itemClass(m === minute)}
              >
                {pad(m)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-center text-xs text-muted-foreground">{t('common.amPm')}</p>
          <div role="group" aria-label={t('common.amPm')} className="flex w-14 flex-col gap-0.5">
            {['AM', 'PM'].map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={p === period}
                onClick={() => pickPeriod(p)}
                className={itemClass(p === period)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onDone}
        className="mt-2 w-full rounded-md py-1.5 text-sm text-primary hover:bg-muted"
      >
        {t('common.clockDone')}
      </button>
    </div>
  );
}

export { TimeClock };
