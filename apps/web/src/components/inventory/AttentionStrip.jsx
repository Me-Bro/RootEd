import { cn } from '../../lib/utils.js';

// Surfaces the two facts an admin actually needs today — low stock and
// not-yet-returned issues — above the item list instead of burying them
// behind the Low Stock / Movements tabs. Hides entirely when both are 0:
// nothing to draw attention to today (docs/mobile-ui/18-inventory-approved.html §5).
export default function AttentionStrip({
  lowStockCount = 0,
  notReturnedCount = 0,
  onTapLowStock,
  onTapNotReturned,
}) {
  if (!lowStockCount && !notReturnedCount) return null;

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Items needing attention">
      {lowStockCount > 0 && (
        <button
          type="button"
          onClick={onTapLowStock}
          className={cn(
            'flex-1 min-w-[140px] rounded-lg border px-3 py-2 text-left transition-colors',
            'border-destructive/30 bg-destructive/5 hover:bg-destructive/10'
          )}
        >
          <div className="text-lg font-semibold text-destructive">{lowStockCount}</div>
          <div className="text-xs text-muted-foreground">
            {lowStockCount === 1 ? 'item low on stock' : 'items low on stock'}
          </div>
        </button>
      )}
      {notReturnedCount > 0 && (
        <button
          type="button"
          onClick={onTapNotReturned}
          className={cn(
            'flex-1 min-w-[140px] rounded-lg border px-3 py-2 text-left transition-colors',
            'border-yellow-300 bg-yellow-50 hover:bg-yellow-100',
            'dark:border-yellow-800 dark:bg-yellow-900/20 dark:hover:bg-yellow-900/30'
          )}
        >
          <div className="text-lg font-semibold text-yellow-800 dark:text-yellow-400">
            {notReturnedCount}
          </div>
          <div className="text-xs text-muted-foreground">
            {notReturnedCount === 1 ? 'item not yet returned' : 'items not yet returned'}
          </div>
        </button>
      )}
    </div>
  );
}
