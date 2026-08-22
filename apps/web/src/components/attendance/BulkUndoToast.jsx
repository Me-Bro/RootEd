import { useEffect } from 'react';

export default function BulkUndoToast({ count, onUndo, onExpire }) {
  useEffect(() => {
    const id = setTimeout(onExpire, 5000);
    return () => clearTimeout(id);
  }, [onExpire]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-lg"
    >
      <span>
        <b>{count}</b> {count === 1 ? 'student' : 'students'} marked present
      </span>
      <button type="button" onClick={onUndo} className="font-semibold text-primary hover:underline">
        UNDO
      </button>
    </div>
  );
}
