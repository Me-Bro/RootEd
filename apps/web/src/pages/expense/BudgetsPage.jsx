import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { DataTable, TableRow, TableCell } from '../../components/ui/DataTable.jsx';
import { SelectField, SelectItem } from '../../components/ui/SelectField.jsx';

// Returns the raw utilization ratio (spent/cap), or null when cap is 0/negative
// so callers can special-case "no cap set" instead of dividing by zero.
function utilizationRatio(cap, spent) {
  return cap > 0 ? spent / cap : null;
}

function UtilizationBar({ spent, cap }) {
  const ratio = utilizationRatio(cap, spent);

  if (ratio === null) {
    return (
      <div className="flex items-center gap-2 min-w-[120px]">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden" />
        <span className="text-xs text-muted-foreground w-10 text-right">—</span>
      </div>
    );
  }

  const pct = Math.min(100, ratio * 100);
  let color = 'bg-emerald-500';
  if (pct >= 100) color = 'bg-destructive';
  else if (pct >= 80) color = 'bg-amber-500';

  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-2 ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-10 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}

function SetBudgetModal({ open, onOpenChange, costCenters }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    costCenterId: '',
    period: 'monthly',
    cap: '',
    year: String(new Date().getFullYear()),
  });
  const [error, setError] = useState('');

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  const mutation = useMutation({
    mutationFn: (data) =>
      api
        .post('/expense/budgets', { ...data, cap: Number(data.cap), year: Number(data.year) })
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      onOpenChange(false);
      setForm({
        costCenterId: '',
        period: 'monthly',
        cap: '',
        year: String(new Date().getFullYear()),
      });
      setError('');
    },
    onError: (err) => setError(err.response?.data?.error || 'Failed to set budget'),
  });

  const selectCls =
    'h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set Budget</DialogTitle>
        </DialogHeader>
        <form
          id="set-budget"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(form);
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Cost Center</label>
            <select
              value={form.costCenterId}
              onChange={update('costCenterId')}
              required
              className={selectCls}
            >
              <option value="">— Select —</option>
              {costCenters.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <SelectField
            label="Period"
            value={form.period}
            onValueChange={(v) => setForm((f) => ({ ...f, period: v }))}
          >
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="annual">Annual</SelectItem>
          </SelectField>
          <Input
            label="Cap Amount (INR)"
            type="number"
            value={form.cap}
            onChange={update('cap')}
            required
            min="1"
          />
          <Input label="Year" type="number" value={form.year} onChange={update('year')} required />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="set-budget" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save Budget'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BudgetsPage() {
  const [showSet, setShowSet] = useState(false);
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));

  const { data: costCenters = [] } = useQuery({
    queryKey: ['cost-centers'],
    queryFn: () => api.get('/expense/cost-centers').then((r) => r.data),
  });

  const {
    data: budgets = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['budgets', yearFilter],
    queryFn: () => {
      const params = new URLSearchParams({ year: yearFilter });
      return api.get(`/expense/budgets?${params}`).then((r) => r.data);
    },
  });

  const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

  // Worst-first: sorted by utilization descending so cost centers closest to (or over)
  // their cap surface first, instead of whatever order they were inserted in. Budgets
  // with no cap set (cap <= 0) have no meaningful ratio, so they always sort last.
  const sortedBudgets = [...budgets].sort((a, b) => {
    const ra = utilizationRatio(a.cap, a.spent);
    const rb = utilizationRatio(b.cap, b.spent);
    if (ra === null && rb === null) return 0;
    if (ra === null) return 1;
    if (rb === null) return -1;
    return rb - ra;
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Budgets"
        action={<Button onClick={() => setShowSet(true)}>Set Budget</Button>}
      />

      <div className="flex gap-3 items-center">
        <SelectField value={yearFilter} onValueChange={setYearFilter} placeholder="Select year">
          {years.map((y) => (
            <SelectItem key={y} value={y}>
              {y}
            </SelectItem>
          ))}
        </SelectField>
      </div>

      {error && <p className="text-destructive">Failed to load budgets</p>}

      <DataTable
        headers={['Cost Center', 'Period', 'Cap', 'Spent', 'Remaining', 'Utilization']}
        isLoading={isLoading}
        isEmpty={budgets.length === 0}
        emptyMessage="No budgets configured"
      >
        {sortedBudgets.map((b) => {
          const remaining = b.cap - b.spent;
          return (
            <TableRow key={b._id} className="bg-card">
              <TableCell className="px-4 py-3 font-medium">{b.costCenterId?.name || '—'}</TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground capitalize">
                {b.period}
              </TableCell>
              <TableCell className="px-4 py-3">{b.cap?.toFixed(2)}</TableCell>
              <TableCell className="px-4 py-3">{b.spent?.toFixed(2)}</TableCell>
              <TableCell
                className={`px-4 py-3 font-medium ${remaining < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}
              >
                {remaining.toFixed(2)}
              </TableCell>
              <TableCell className="px-4 py-3">
                <UtilizationBar spent={b.spent} cap={b.cap} />
              </TableCell>
            </TableRow>
          );
        })}
      </DataTable>

      <SetBudgetModal open={showSet} onOpenChange={setShowSet} costCenters={costCenters} />
    </div>
  );
}
