import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog.jsx';
import { formatCurrency } from '../../utils/intl.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { DataTable, TableRow, TableCell } from '../../components/ui/DataTable.jsx';

const STATUS_TABS = ['All', 'Pending', 'Approved', 'Rejected', 'Paid'];

function statusVariant(status) {
  if (status === 'approved' || status === 'paid') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'rejected') return 'danger';
  return 'default';
}

function NewExpenseModal({ open, onOpenChange, costCenters }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    title: '',
    category: '',
    amount: '',
    vendor: '',
    invoiceDate: '',
    costCenterId: '',
    paymentMethod: '',
    isReimbursement: false,
  });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');

  function update(field) {
    return (e) =>
      setForm((f) => ({
        ...f,
        [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
      }));
  }

  const mutation = useMutation({
    mutationFn: async (data) => {
      const entry = await api
        .post('/expense/entries', {
          ...data,
          amount: Number(data.amount),
        })
        .then((r) => r.data);

      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        await api.post(`/expense/entries/${entry._id}/attachments`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      return entry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-entries'] });
      onOpenChange(false);
      setForm({
        title: '',
        category: '',
        amount: '',
        vendor: '',
        invoiceDate: '',
        costCenterId: '',
        paymentMethod: '',
        isReimbursement: false,
      });
      setFile(null);
      setError('');
    },
    onError: (err) => setError(err.response?.data?.error || 'Failed to create expense'),
  });

  const selectCls =
    'h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Expense</DialogTitle>
        </DialogHeader>
        <form
          id="new-expense"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(form);
          }}
          className="flex flex-col gap-4"
        >
          <Input label="Title" value={form.title} onChange={update('title')} required />
          <Input label="Category" value={form.category} onChange={update('category')} required />
          <Input
            label="Amount (INR)"
            type="number"
            value={form.amount}
            onChange={update('amount')}
            required
            min="0"
          />
          <Input label="Vendor" value={form.vendor} onChange={update('vendor')} />
          <Input
            label="Invoice Date"
            type="date"
            value={form.invoiceDate}
            onChange={update('invoiceDate')}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Cost Center</label>
            <select
              value={form.costCenterId}
              onChange={update('costCenterId')}
              className={selectCls}
            >
              <option value="">— None —</option>
              {costCenters.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Payment Method</label>
            <select
              value={form.paymentMethod}
              onChange={update('paymentMethod')}
              className={selectCls}
            >
              <option value="">— Select —</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="upi">UPI</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isReimbursement}
              onChange={update('isReimbursement')}
            />
            <span>Is Reimbursement</span>
          </label>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Attachment</label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="text-sm"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="new-expense" disabled={mutation.isPending}>
            {mutation.isPending ? 'Submitting…' : 'Submit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectModal({ open, onOpenChange, entryId }) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/expense/entries/${entryId}/reject`, { comment }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-entries'] });
      onOpenChange(false);
      setComment('');
      setError('');
    },
    onError: (err) => setError(err.response?.data?.error || 'Failed to reject'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject Expense</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Reason for rejection…"
            rows={3}
            className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Rejecting…' : 'Reject'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ExpensesPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('All');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [rejectId, setRejectId] = useState(null);

  const { data: costCenters = [] } = useQuery({
    queryKey: ['cost-centers'],
    queryFn: () => api.get('/expense/cost-centers').then((r) => r.data),
  });

  const {
    data: entries = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['expense-entries', activeTab, from, to, costCenterId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (activeTab !== 'All') params.set('status', activeTab.toLowerCase());
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (costCenterId) params.set('costCenterId', costCenterId);
      return api.get(`/expense/entries?${params}`).then((r) => r.data);
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id) => api.patch(`/expense/entries/${id}/approve`).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expense-entries'] }),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Expenses"
        action={<Button onClick={() => setShowNew(true)}>New Expense</Button>}
      />

      <div className="flex gap-1 border-b border-border">
        {STATUS_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={[
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === t
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <select
          value={costCenterId}
          onChange={(e) => setCostCenterId(e.target.value)}
          className="h-9 rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">All Cost Centers</option>
          {costCenters.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {error && <p className="text-destructive">Failed to load expenses</p>}

      <DataTable
        headers={[
          'Title',
          'Category',
          'Amount',
          'Vendor',
          'Cost Center',
          'Status',
          'Submitted By',
          'Actions',
        ]}
        isLoading={isLoading}
        isEmpty={entries.length === 0}
        emptyMessage="No expenses found"
      >
        {entries.map((e) => (
          <TableRow key={e._id} className="bg-card">
            <TableCell className="px-4 py-3 font-medium">{e.title}</TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">{e.category}</TableCell>
            <TableCell className="px-4 py-3">{formatCurrency(e.amount ?? 0)}</TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">{e.vendor || '—'}</TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">
              {e.costCenterId?.name || '—'}
            </TableCell>
            <TableCell className="px-4 py-3">
              <Badge variant={statusVariant(e.status)}>{e.status}</Badge>
            </TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">
              {e.submittedBy?.email || '—'}
            </TableCell>
            <TableCell className="px-4 py-3">
              {e.status === 'pending' && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => approveMutation.mutate(e._id)}
                    disabled={approveMutation.isPending}
                  >
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRejectId(e._id)}>
                    Reject
                  </Button>
                </div>
              )}
            </TableCell>
          </TableRow>
        ))}
      </DataTable>

      <NewExpenseModal open={showNew} onOpenChange={setShowNew} costCenters={costCenters} />
      <RejectModal
        open={Boolean(rejectId)}
        onOpenChange={(v) => !v && setRejectId(null)}
        entryId={rejectId}
      />
    </div>
  );
}
