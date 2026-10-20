import { useId } from 'react';
import { cn } from '@/lib/utils';

const field =
  'h-9 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring disabled:opacity-50 aria-invalid:border-destructive';

/** A labelled text input. The label is always rendered: placeholders are not labels. */
export function Input({ label, error, className, id, ...props }) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-muted-foreground">
          {label}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={cn(field, className)}
        {...props}
      />
      {error && (
        <p id={`${inputId}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** A labelled native select — the platform control, so it works with every keyboard and screen reader. */
export function Select({ label, className, id, children, ...props }) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-xs font-medium text-muted-foreground">
          {label}
        </label>
      )}
      <select id={selectId} className={cn(field, 'pr-8', className)} {...props}>
        {children}
      </select>
    </div>
  );
}

export function Textarea({ label, className, id, ...props }) {
  const autoId = useId();
  const areaId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={areaId} className="text-xs font-medium text-muted-foreground">
          {label}
        </label>
      )}
      <textarea id={areaId} className={cn(field, 'h-auto min-h-20 py-2', className)} {...props} />
    </div>
  );
}
