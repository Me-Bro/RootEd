import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils.js';
import { Badge } from '../ui/Badge.jsx';
import { formatCurrency } from '../../utils/intl.js';

function pctVariant(pct) {
  if (pct >= 100) return 'danger';
  if (pct >= 75) return 'warning';
  return 'success';
}

function pctBarColor(pct) {
  if (pct >= 100) return 'bg-destructive';
  if (pct >= 75) return 'bg-yellow-500 dark:bg-yellow-600';
  return 'bg-primary';
}

/**
 * Budget-in-context strip on an ApprovalQueueCard — docs/mobile-ui/14-expenses-approved.html
 * §1/§3. Shows the cost center's annual spend-to-date and what approving this
 * expense would push it to, using `projectedPct = (spent + amount) / cap`
 * exactly as specified.
 *
 * Renders nothing when there's no budget for the entry's cost center (§5:
 * "context card hides; approve/reject still works without it") — the caller
 * is responsible for resolving `budget` (or leaving it undefined) before
 * passing it down, per the component's `{ budget, projectedAmount }` contract.
 */
export default function BudgetContextBar({ budget, projectedAmount }) {
  const { t } = useTranslation();
  if (!budget || !budget.cap) return null;

  const spentPct = Math.round((budget.spent / budget.cap) * 100);
  const projectedPct = Math.round(((budget.spent + projectedAmount) / budget.cap) * 100);
  const label = budget.costCenterId?.name
    ? t('expense.entries.namedBudget', { name: budget.costCenterId.name })
    : budget.category
      ? t('expense.entries.namedBudget', { name: budget.category })
      : t('expense.entries.budgetFallback');

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <Badge variant={pctVariant(spentPct)}>
          {t('expense.entries.pctSpent', { pct: spentPct })}
        </Badge>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(spentPct, 100)}
        aria-label={t('expense.entries.budgetProgressAria', {
          label,
          pct: spentPct,
          period: budget.period,
        })}
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full transition-all', pctBarColor(spentPct))}
          style={{ width: `${Math.min(spentPct, 100)}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {t('expense.entries.budgetCapSummary', {
          spent: formatCurrency(budget.spent ?? 0),
          cap: formatCurrency(budget.cap),
          period: budget.period,
          projectedPct,
        })}
      </p>
    </div>
  );
}
