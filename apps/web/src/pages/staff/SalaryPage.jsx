import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { useAuth } from '../../contexts/useAuth.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { DataTable, TableRow, TableCell } from '../../components/ui/DataTable.jsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog.jsx';
import { useJobPolling } from '../../hooks/useJobPolling.js';
import { formatCurrency } from '../../utils/intl.js';
import { PayrollTotalCard } from '../../components/salary/PayrollTotalCard.jsx';
import { GenerateProgress } from '../../components/salary/GenerateProgress.jsx';

const selectCls =
  'h-9 rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function statusVariant(status) {
  if (status === 'paid') return 'success';
  if (status === 'generated') return 'warning';
  if (status === 'queued') return 'secondary';
  if (status === 'failed') return 'danger';
  return 'default';
}

function MarkPaidDialog({ open, onOpenChange, slip }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.post(`/staff/salary-slips/${slip._id}/mark-paid`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-slips'] });
      onOpenChange(false);
      setError('');
    },
    onError: (err) => setError(err.response?.data?.error || 'Failed to mark slip as paid'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark Slip as Paid?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This marks{' '}
          <strong className="text-foreground">
            {slip?.staffId?.firstName} {slip?.staffId?.lastName}
          </strong>
          's slip as paid. This cannot be undone.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GenerateAllPanel({ jobId, staffCount, month, year }) {
  const queryClient = useQueryClient();
  const { state, result, progress, error, timedOut } = useJobPolling(
    jobId ? `/staff/salary-slips/status/${jobId}` : null,
    {
      onSettled: () => queryClient.invalidateQueries({ queryKey: ['salary-slips', month, year] }),
    }
  );

  if (!jobId) return null;

  const isSettled = state === 'completed' || state === 'failed';

  return (
    <div
      className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3"
      aria-live="polite"
    >
      <p className="text-sm text-muted-foreground">
        Job ID: <span className="font-mono text-xs">{jobId}</span> — generating slips for{' '}
        {staffCount} staff member{staffCount === 1 ? '' : 's'}…
      </p>
      {!isSettled && (
        <GenerateProgress done={progress?.completed ?? 0} total={progress?.total ?? staffCount} />
      )}
      {state === 'completed' && result && (
        <div className="text-sm">
          <p className="text-emerald-600 dark:text-emerald-400">
            {result.succeeded?.length ?? 0} slip{result.succeeded?.length === 1 ? '' : 's'}{' '}
            generated.
          </p>
          {result.failed?.length > 0 && (
            <div className="mt-1 text-destructive">
              <p>{result.failed.length} failed:</p>
              <ul className="list-disc list-inside">
                {result.failed.map((f) => (
                  <li key={f.staffId}>{f.error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {state === 'failed' && <p className="text-sm text-destructive">Job failed.</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {timedOut && <p className="text-sm text-destructive">Timed out waiting for the job.</p>}
    </div>
  );
}

export default function SalaryPage() {
  const { user } = useAuth();
  const canWrite = (user?.permissions ?? []).includes('payroll:write');
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [genError, setGenError] = useState('');
  const [genJob, setGenJob] = useState(null);
  const [markPaidFor, setMarkPaidFor] = useState(null);

  const {
    data: slips = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['salary-slips', month, year],
    queryFn: () => {
      const params = new URLSearchParams({ month, year });
      return api.get(`/staff/salary-slips?${params}`).then((r) => r.data);
    },
  });

  const generateAllMutation = useMutation({
    mutationFn: () =>
      api
        .post('/staff/salary-slips/generate-all', { month: Number(month), year: Number(year) })
        .then((r) => r.data),
    onSuccess: (data) => {
      setGenJob({ jobId: data.jobId, staffCount: data.staffCount });
      setGenError('');
    },
    onError: (err) => setGenError(err.response?.data?.error || 'Failed to start generation'),
  });

  const downloadMutation = useMutation({
    mutationFn: (id) => api.get(`/staff/salary-slips/${id}/download`).then((r) => r.data),
    onSuccess: (data) => window.open(data.url, '_blank'),
  });

  const years = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Salary Slips"
        action={
          <div className="flex gap-2">
            <Link to="/staff/salary-structures">
              <Button variant="outline">Manage Structures</Button>
            </Link>
            {canWrite && (
              <Button
                onClick={() => generateAllMutation.mutate()}
                disabled={generateAllMutation.isPending}
              >
                {generateAllMutation.isPending ? 'Starting…' : 'Generate All Slips'}
              </Button>
            )}
          </div>
        }
      />

      <div className="flex gap-3 flex-wrap items-center">
        <select value={month} onChange={(e) => setMonth(e.target.value)} className={selectCls}>
          {MONTHS.map((m, i) => (
            <option key={m} value={String(i + 1)}>
              {m}
            </option>
          ))}
        </select>
        <select value={year} onChange={(e) => setYear(e.target.value)} className={selectCls}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {slips.length > 0 && <PayrollTotalCard slips={slips} />}

      {genError && <p className="text-sm text-destructive">{genError}</p>}

      {genJob && (
        <GenerateAllPanel
          jobId={genJob.jobId}
          staffCount={genJob.staffCount}
          month={month}
          year={year}
        />
      )}

      {error && <p className="text-destructive">Failed to load salary slips</p>}

      <DataTable
        headers={['Staff Name', 'Gross Earnings', 'Deductions', 'Net Pay', 'Status', 'Actions']}
        isLoading={isLoading}
        isEmpty={slips.length === 0}
        emptyMessage="No slips generated for this period"
      >
        {slips.map((s) => (
          <TableRow key={s._id} className="bg-card">
            <TableCell className="px-4 py-3">
              {s.staffId?.firstName} {s.staffId?.lastName}
            </TableCell>
            <TableCell className="px-4 py-3">{formatCurrency(s.grossEarnings ?? 0)}</TableCell>
            <TableCell className="px-4 py-3">{formatCurrency(s.totalDeductions ?? 0)}</TableCell>
            <TableCell className="px-4 py-3 font-semibold">
              {formatCurrency(s.netPay ?? 0)}
            </TableCell>
            <TableCell className="px-4 py-3">
              <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
            </TableCell>
            <TableCell className="px-4 py-3">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadMutation.mutate(s._id)}
                  disabled={!s.pdfKey || downloadMutation.isPending}
                >
                  Download
                </Button>
                {canWrite && s.status === 'generated' && (
                  <Button size="sm" variant="outline" onClick={() => setMarkPaidFor(s)}>
                    Mark as Paid
                  </Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>

      {markPaidFor && (
        <MarkPaidDialog
          open={Boolean(markPaidFor)}
          onOpenChange={(v) => !v && setMarkPaidFor(null)}
          slip={markPaidFor}
        />
      )}
    </div>
  );
}
