import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../ui/Card.jsx';
import { formatCurrency } from '../../utils/intl.js';

// Component contract per docs/mobile-ui/19-depreciation-approved.html §4:
// { currentTotal, originalTotal }. Percentage retained is derived here — it's
// pure math over the two totals the caller already computed client-side.
export default function FleetTotalCard({ currentTotal, originalTotal }) {
  const { t } = useTranslation();
  const pct = originalTotal > 0 ? (currentTotal / originalTotal) * 100 : 0;
  const clampedPct = Math.min(100, Math.max(0, pct));

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            {t('inventory.depreciation.fleetValue')}
          </span>
          <span className="text-sm font-semibold">
            {t('inventory.depreciation.fleetValueOfTotal', {
              current: formatCurrency(currentTotal),
              original: formatCurrency(originalTotal),
            })}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={t('inventory.depreciation.fleetValueRetainedAria')}
          aria-valuenow={Math.round(clampedPct)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${clampedPct}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {t('inventory.depreciation.pctRetained', { pct: pct.toFixed(1) })}
        </span>
      </CardContent>
    </Card>
  );
}
