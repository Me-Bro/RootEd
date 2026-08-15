import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog.jsx';
import { formatCurrency } from '../../utils/intl.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { DataTable, TableRow, TableCell } from '../../components/ui/DataTable.jsx';

const TABS = ['Assignments', 'Payments', 'Defaulters'];

function statusVariant(status) {
  if (status === 'paid') return 'success';
  if (status === 'partial') return 'warning';
  if (status === 'waived') return 'default';
  return 'danger';
}

function CollectPaymentModal({ open, onOpenChange, assignment }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ amount: '', paymentMethod: 'cash', transactionId: '', notes: '' });
  const [receiptUrl, setReceiptUrl] = useState(null);
  const [error, setError] = useState('');
  const [onlineSuccess, setOnlineSuccess] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function handleClose() {
    onOpenChange(false);
    setReceiptUrl(null);
    setOnlineSuccess(false);
    setPaymentSuccess(false);
    setForm({ amount: '', paymentMethod: 'cash', transactionId: '', notes: '' });
    setError('');
  }

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/fee/payments', {
        assignmentId: assignment._id,
        amount: Number(form.amount),
        paymentMethod: form.paymentMethod,
        transactionId: form.transactionId,
        notes: form.notes,
      }).then((r) => r.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['fee-assignments'] });
      setPaymentSuccess(true);
      if (data.receiptUrl) setReceiptUrl(data.receiptUrl);
    },
    onError: (err) => setError(err.response?.data?.error || 'Payment failed'),
  });

  async function handlePayOnline() {
    setError('');
    try {
      const { data: orderData } = await api.post('/fee/payments/initiate', { assignmentId: assignment._id });
      if (orderData.mock) {
        setOnlineSuccess(true);
        queryClient.invalidateQueries({ queryKey: ['fee-assignments'] });
        return;
      }
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
      });
      const rzp = new window.Razorpay({
        key: orderData.key,
        amount: orderData.amount,
        currency: orderData.currency,
        order_id: orderData.orderId,
        handler: async (response) => {
          try {
            await api.post('/fee/payments/verify', { ...response, assignmentId: assignment._id });
            queryClient.invalidateQueries({ queryKey: ['fee-assignments'] });
            setOnlineSuccess(true);
          } catch {
            setError('Payment verification failed');
          }
        },
      });
      rzp.open();
    } catch {
      setError('Failed to initiate online payment');
    }
  }

  const selectCls = 'h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {receiptUrl || onlineSuccess || paymentSuccess ? 'Payment Successful' : 'Collect Payment'}
          </DialogTitle>
        </DialogHeader>

        {receiptUrl || onlineSuccess || paymentSuccess ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">Payment recorded successfully.</p>
            {receiptUrl && (
              <a
                href={receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-primary hover:underline text-sm font-medium"
              >
                Download Receipt PDF
              </a>
            )}
          </div>
        ) : (
          <form id="collect-payment" onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="flex flex-col gap-4">
            <div className="text-sm text-muted-foreground rounded-lg bg-muted/50 px-3 py-2">
              Student: <strong className="text-foreground">{assignment?.studentId?.firstName} {assignment?.studentId?.lastName}</strong>
              <br />
              Total Due: <strong className="text-foreground">{formatCurrency((assignment?.totalAmount ?? 0) - (assignment?.discountAmount || 0))}</strong>
            </div>
            <Input label="Amount" type="number" value={form.amount} onChange={update('amount')} required min="1" />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Payment Method</label>
              <select value={form.paymentMethod} onChange={update('paymentMethod')} className={selectCls}>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
            <Input label="Transaction ID (optional)" value={form.transactionId} onChange={update('transactionId')} />
            <Input label="Notes (optional)" value={form.notes} onChange={update('notes')} />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {receiptUrl || onlineSuccess || paymentSuccess ? 'Close' : 'Cancel'}
          </Button>
          {!receiptUrl && !onlineSuccess && !paymentSuccess && (
            <>
              <Button variant="outline" type="button" onClick={handlePayOnline}>
                Pay Online
              </Button>
              <Button type="submit" form="collect-payment" disabled={mutation.isPending}>
                {mutation.isPending ? 'Processing…' : 'Record Payment'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignmentsTab() {
  const [studentSearch, setStudentSearch] = useState('');
  const [yearId, setYearId] = useState('');
  const [collectFor, setCollectFor] = useState(null);

  const { data: years = [] } = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => api.get('/academic/years').then((r) => r.data),
  });

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['fee-assignments', yearId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (yearId) params.set('yearId', yearId);
      return api.get(`/fee/assignments?${params}`).then((r) => r.data);
    },
  });

  const filtered = studentSearch
    ? assignments.filter((a) => {
        const name = `${a.studentId?.firstName ?? ''} ${a.studentId?.lastName ?? ''}`.toLowerCase();
        const admNo = (a.studentId?.admissionNo ?? '').toLowerCase();
        const q = studentSearch.toLowerCase();
        return name.includes(q) || admNo.includes(q);
      })
    : assignments;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 flex-wrap">
        <Input placeholder="Search student…" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
        <select
          value={yearId}
          onChange={(e) => setYearId(e.target.value)}
          className="h-9 rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">All Years</option>
          {years.map((y) => <option key={y._id} value={y._id}>{y.name}</option>)}
        </select>
      </div>

      <DataTable
        headers={['Student', 'Admission No', 'Structure', 'Total', 'Discount', 'Status', 'Due Date', 'Action']}
        isLoading={isLoading}
        isEmpty={filtered.length === 0}
        emptyMessage="No assignments found"
      >
        {filtered.map((a) => (
          <TableRow key={a._id} className="bg-card">
            <TableCell className="px-4 py-3">{a.studentId?.firstName} {a.studentId?.lastName}</TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">{a.studentId?.admissionNo}</TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">{a.feeStructureId?.name}</TableCell>
            <TableCell className="px-4 py-3">{formatCurrency(a.totalAmount ?? 0)}</TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">{formatCurrency(a.discountAmount ?? 0)}</TableCell>
            <TableCell className="px-4 py-3">
              <Badge variant={statusVariant(a.status)}>{a.status}</Badge>
            </TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">
              {a.dueDate ? new Date(a.dueDate).toLocaleDateString() : '—'}
            </TableCell>
            <TableCell className="px-4 py-3">
              {a.status !== 'paid' && a.status !== 'waived' && (
                <Button size="sm" onClick={() => setCollectFor(a)}>Collect</Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </DataTable>

      <CollectPaymentModal
        open={Boolean(collectFor)}
        onOpenChange={(v) => !v && setCollectFor(null)}
        assignment={collectFor}
      />
    </div>
  );
}

function PaymentsTab() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['fee-payments', from, to],
    queryFn: () => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      return api.get(`/fee/payments?${params}`).then((r) => r.data);
    },
  });

  async function downloadReceipt(paymentId) {
    const { data } = await api.get(`/fee/payments/${paymentId}/receipt`);
    if (data.url) window.open(data.url, '_blank');
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 flex-wrap items-center">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      <DataTable
        headers={['Receipt No', 'Student', 'Amount', 'Method', 'Date', 'Collected By', 'Receipt']}
        isLoading={isLoading}
        isEmpty={payments.length === 0}
        emptyMessage="No payments found"
      >
        {payments.map((p) => (
          <TableRow key={p._id} className="bg-card">
            <TableCell className="px-4 py-3 font-mono text-xs">{p.receiptNumber}</TableCell>
            <TableCell className="px-4 py-3">{p.studentId?.firstName} {p.studentId?.lastName}</TableCell>
            <TableCell className="px-4 py-3">{formatCurrency(p.amount ?? 0)}</TableCell>
            <TableCell className="px-4 py-3 capitalize">{p.paymentMethod}</TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">
              {p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : '—'}
            </TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">{p.collectedBy?.email}</TableCell>
            <TableCell className="px-4 py-3">
              <Button size="sm" variant="outline" onClick={() => downloadReceipt(p._id)}>
                Download
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
    </div>
  );
}

function DefaultersTab() {
  const [yearId, setYearId] = useState('');

  const { data: years = [] } = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => api.get('/academic/years').then((r) => r.data),
  });

  const { data: defaulters = [], isLoading } = useQuery({
    queryKey: ['fee-defaulters', yearId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (yearId) params.set('yearId', yearId);
      return api.get(`/fee/defaulters?${params}`).then((r) => r.data);
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <select
          value={yearId}
          onChange={(e) => setYearId(e.target.value)}
          className="h-9 rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">All Years</option>
          {years.map((y) => <option key={y._id} value={y._id}>{y.name}</option>)}
        </select>
      </div>

      <DataTable
        headers={['Student', 'Admission No', 'Amount Due', 'Status', 'Due Date', 'Days Overdue']}
        isLoading={isLoading}
        isEmpty={defaulters.length === 0}
        emptyMessage="No defaulters found"
      >
        {defaulters.map((d) => (
          <TableRow key={d._id} className="bg-card">
            <TableCell className="px-4 py-3">{d.studentId?.firstName} {d.studentId?.lastName}</TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">{d.studentId?.admissionNo}</TableCell>
            <TableCell className="px-4 py-3">{formatCurrency(d.totalAmount - (d.discountAmount || 0))}</TableCell>
            <TableCell className="px-4 py-3">
              <Badge variant={statusVariant(d.status)}>{d.status}</Badge>
            </TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">
              {d.dueDate ? new Date(d.dueDate).toLocaleDateString() : '—'}
            </TableCell>
            <TableCell className="px-4 py-3 text-destructive font-medium">{d.daysOverdue}</TableCell>
          </TableRow>
        ))}
      </DataTable>
    </div>
  );
}

export default function FeesPage() {
  const [activeTab, setActiveTab] = useState('Assignments');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Fee Collection" />

      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
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

      {activeTab === 'Assignments' && <AssignmentsTab />}
      {activeTab === 'Payments' && <PaymentsTab />}
      {activeTab === 'Defaulters' && <DefaultersTab />}
    </div>
  );
}
