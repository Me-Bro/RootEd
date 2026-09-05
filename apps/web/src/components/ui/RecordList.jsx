import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The below-`md` counterpart to DataTable. A table with 6+ columns of
 * `whitespace-nowrap` cells can only scroll sideways on a phone, so every page
 * that renders a DataTable pairs it with this list and hides the table at `md`
 * (see docs/mobile-ui/*-approved.html — the approved specs all replace the
 * table with a title/meta/trailing card row rather than shrinking it).
 *
 * Hidden at `md` and up by default, so callers only decide what goes in a row,
 * not which viewport it belongs to.
 */
export function RecordList({
  children,
  isLoading = false,
  isEmpty = false,
  emptyMessage,
  rows = 4,
}) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <ul className="flex flex-col gap-2 md:hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="rounded-lg border border-border p-3">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-2 h-3 w-3/4" />
          </li>
        ))}
      </ul>
    );
  }

  if (isEmpty) {
    return (
      <p className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground md:hidden">
        {emptyMessage ?? t('common.noRecordsFound')}
      </p>
    );
  }

  return <ul className="flex flex-col gap-2 md:hidden">{children}</ul>;
}

/**
 * One row. `title` is the identifying line, `meta` the supporting detail
 * (already joined by the caller — a row's own fields differ per module), and
 * `trailing` the status badge or per-row action the table kept in its last
 * column. Passing `onClick` makes the whole row the tap target instead of
 * relying on a small chevron.
 */
export function RecordListItem({ title, meta, trailing, footer, onClick, className }) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium break-words">{title}</p>
          {meta && <p className="mt-0.5 text-xs text-muted-foreground break-words">{meta}</p>}
        </div>
        {trailing && <div className="flex shrink-0 items-center gap-2">{trailing}</div>}
      </div>
      {footer && <div className="mt-3">{footer}</div>}
    </>
  );

  return (
    <li className={cn('rounded-lg border border-border p-3', className)}>
      {onClick ? (
        <button type="button" onClick={onClick} className="w-full text-left">
          {content}
        </button>
      ) : (
        content
      )}
    </li>
  );
}
