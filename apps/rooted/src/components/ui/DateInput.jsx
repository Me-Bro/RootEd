import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input as InputPrimitive } from '@base-ui/react/input';

// A typed date field that always reads DD-MM-YYYY, whatever the browser locale.
// The value in and out is the ISO `YYYY-MM-DD` string a native date input uses (or ''),
// so callers keep their state, validation schemas and API payloads unchanged.

/** 'YYYY-MM-DD' (or a longer ISO string) -> 'DD-MM-YYYY'; anything else -> ''. */
function isoToDisplay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

/** 'DD-MM-YYYY' -> 'YYYY-MM-DD' for a real calendar date; anything else -> ''. */
function displayToIso(text) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text ?? '');
  if (!m) return '';
  const [, dd, mm, yyyy] = m;
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  const real =
    d.getUTCFullYear() === Number(yyyy) &&
    d.getUTCMonth() === Number(mm) - 1 &&
    d.getUTCDate() === Number(dd);
  return real ? `${yyyy}-${mm}-${dd}` : '';
}

/** Keeps digits only and inserts the dashes as the user types. A pasted ISO date is converted. */
function maskDate(raw) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return isoToDisplay(raw.trim());
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length > 4) return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
  if (digits.length > 2) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return digits;
}

function DateInput({ value, onChange, min, max, name, id, ...props }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  const [text, setText] = useState(() => isoToDisplay(value));
  const [seen, setSeen] = useState(value ?? '');

  // The parent changed the value (reset, "back to today"): show it. Typing round-trips
  // through onChange, so a value that still matches the text is left alone.
  if ((value ?? '') !== seen) {
    setSeen(value ?? '');
    if ((value ?? '') !== displayToIso(text)) setText(isoToDisplay(value));
  }

  const iso = displayToIso(text);
  let problem = '';
  if (text && !iso) problem = t('common.dateInvalid');
  else if (iso && min && iso < min) problem = t('common.dateMin', { date: isoToDisplay(min) });
  else if (iso && max && iso > max) problem = t('common.dateMax', { date: isoToDisplay(max) });

  // Native form validation (`required`, submit blocking) reads this.
  useEffect(() => {
    ref.current?.setCustomValidity(problem);
  }, [problem]);

  function handleChange(e) {
    const next = maskDate(e.target.value);
    setText(next);
    onChange?.({ target: { value: displayToIso(next), name, id } });
  }

  return (
    <InputPrimitive
      {...props}
      ref={ref}
      id={id}
      name={name}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={10}
      placeholder={props.placeholder ?? 'DD-MM-YYYY'}
      value={text}
      onChange={handleChange}
    />
  );
}

export { DateInput };
