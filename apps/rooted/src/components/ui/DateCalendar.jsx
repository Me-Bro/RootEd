import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';

// A month grid for DateInput. Everything works on ISO `YYYY-MM-DD` strings and UTC dates, so
// the browser's time zone can never shift a day. Names come from Intl in the active language.

const pad = (n) => String(n).padStart(2, '0');
const toIso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

function parseIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) } : null;
}

function addDays(iso, n) {
  const { y, m, d } = parseIso(iso);
  const next = new Date(Date.UTC(y, m, d + n));
  return toIso(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate());
}

function todayIso() {
  const n = new Date();
  return toIso(n.getFullYear(), n.getMonth(), n.getDate());
}

function localeFor(language) {
  return language === 'hi' ? 'hi-IN' : 'en-IN';
}

function DateCalendar({ value, min, max, onPick }) {
  const { t, i18n } = useTranslation();
  const locale = localeFor(i18n.language);
  const today = todayIso();
  const selected = parseIso(value) ? value : '';
  const start = selected || (max && today > max ? max : min && today < min ? min : today);
  const startParts = parseIso(start);

  const [view, setView] = useState({ y: startParts.y, m: startParts.m });
  const [focusIso, setFocusIso] = useState(start);
  const gridRef = useRef(null);
  const moved = useRef(false);

  const monthNames = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' });
    return Array.from({ length: 12 }, (_, i) => f.format(new Date(Date.UTC(2023, i, 1))));
  }, [locale]);
  const weekdays = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
    // 1 Jan 2023 is a Sunday.
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2023, 0, 1 + i))));
  }, [locale]);

  const minYear = (parseIso(min) ?? { y: 1900 }).y;
  const maxYear = (parseIso(max) ?? { y: new Date().getFullYear() + 20 }).y;
  const years = [];
  for (let y = Math.min(minYear, view.y); y <= Math.max(maxYear, view.y); y += 1) years.push(y);

  const firstWeekday = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const dayCount = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: dayCount }, (_, i) => i + 1),
  ];

  const disabled = (iso) => Boolean((min && iso < min) || (max && iso > max));

  // Move keyboard focus to the focused day once the keys have changed it.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (moved.current || !gridRef.current) {
        gridRef.current?.querySelector(`[data-iso="${focusIso}"]`)?.focus();
      }
    });
    return () => cancelAnimationFrame(id);
  }, [focusIso]);

  // Initial focus on open: the selected (or nearest) day.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      gridRef.current?.querySelector('[tabindex="0"]')?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  function shiftMonth(delta) {
    const d = new Date(Date.UTC(view.y, view.m + delta, 1));
    setView({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
  }

  function onKeyDown(e) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = addDays(focusIso, step);
    if (disabled(next)) return;
    const p = parseIso(next);
    moved.current = true;
    setView({ y: p.y, m: p.m });
    setFocusIso(next);
  }

  const selectClass =
    'h-8 rounded-md border border-input bg-transparent px-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-popover';
  const navClass =
    'flex size-8 items-center justify-center rounded-md hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 outline-none';

  return (
    <div className="w-64 select-none">
      <div className="mb-2 flex items-center gap-1">
        <button
          type="button"
          className={navClass}
          aria-label={t('common.calendarPrev')}
          onClick={() => shiftMonth(-1)}
        >
          <ChevronLeft className="size-4" />
        </button>
        <select
          aria-label={t('common.calendarMonth')}
          className={cn(selectClass, 'min-w-0 flex-1')}
          value={view.m}
          onChange={(e) => setView((v) => ({ ...v, m: Number(e.target.value) }))}
        >
          {monthNames.map((name, i) => (
            <option key={name} value={i}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label={t('common.calendarYear')}
          className={selectClass}
          value={view.y}
          onChange={(e) => setView((v) => ({ ...v, y: Number(e.target.value) }))}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={navClass}
          aria-label={t('common.calendarNext')}
          onClick={() => shiftMonth(1)}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-xs text-muted-foreground">
        {weekdays.map((w) => (
          <span key={w} className="py-1">
            {w}
          </span>
        ))}
      </div>

      <div ref={gridRef} className="grid grid-cols-7 gap-y-0.5" onKeyDown={onKeyDown}>
        {cells.map((day, i) => {
          if (day === null) return <span key={`blank-${i}`} />;
          const iso = toIso(view.y, view.m, day);
          const isSelected = iso === selected;
          const inView = parseIso(focusIso).y === view.y && parseIso(focusIso).m === view.m;
          const isFocus = inView ? iso === focusIso : day === 1;
          return (
            <button
              key={iso}
              type="button"
              data-iso={iso}
              tabIndex={isFocus ? 0 : -1}
              disabled={disabled(iso)}
              aria-pressed={isSelected}
              aria-current={iso === today ? 'date' : undefined}
              onClick={() => onPick(iso)}
              onFocus={() => setFocusIso(iso)}
              className={cn(
                'mx-auto flex size-8 items-center justify-center rounded-md text-sm outline-none',
                'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50',
                'disabled:pointer-events-none disabled:opacity-30',
                iso === today && !isSelected && 'font-semibold text-primary',
                isSelected && 'bg-primary text-primary-foreground hover:bg-primary'
              )}
            >
              {day}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        disabled={disabled(today)}
        onClick={() => onPick(today)}
        className="mt-2 w-full rounded-md py-1.5 text-sm text-primary hover:bg-muted disabled:opacity-40"
      >
        {t('common.calendarToday')}
      </button>
    </div>
  );
}

export { DateCalendar };
