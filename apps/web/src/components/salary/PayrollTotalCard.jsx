import { Card, CardContent } from '../ui/Card.jsx';
import { formatCurrency } from '../../utils/intl.js';

/**
 * "The number a principal or accountant actually wants first" — total payroll
 * for the selected period, summed client-side from the already-loaded slips
 * (docs/mobile-ui/13-salary-approved.html §1/§4). No extra API call.
 */
export function PayrollTotalCard({ slips }) {
  const total = slips.reduce((sum, s) => sum + (s.netPay ?? 0), 0);

  return (
    <Card size="sm">
      <CardContent className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Total payroll</p>
          <p className="text-lg font-semibold tabular-nums">{formatCurrency(total)}</p>
        </div>
        <p className="text-right text-xs text-muted-foreground">
          {slips.length} staff · net after deductions
        </p>
      </CardContent>
    </Card>
  );
}
