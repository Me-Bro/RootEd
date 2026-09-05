import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
import { RecordList, RecordListItem } from '../../components/ui/RecordList.jsx';

// Defaulters leads: chasing 160 unpaid + 254 partial assignments (₹1.98Cr
// outstanding) is this module's real job, not an afterthought behind two
// other tabs. See docs/mobile-ui/17-fee-collection-approved.html.
const TAB_IDS = ['defaulters', 'assignments', 'payments'];

function statusVariant(status) {
  if (status === 'paid') return 'success';
  if (status === 'partial') return 'warning';
  if (status === 'waived') return 'default';
  return 'danger';
}

function CollectPaymentModal({ open, onOpenChange, assignment }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    amount: '',
    paymentMethod: 'cash',
    transactionId: '',
    notes: '',
  });
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
      api
        .post('/fee/payments', {
          assignmentId: assignment._id,
          amount: Number(form.amount),
          paymentMethod: form.paymentMethod,
          transactionId: form.transactionId,
          notes: form.notes,
        })
        .then((r) => r.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['fee-assignments'] });
      setPaymentSuccess(true);
      if (data.receiptUrl) setReceiptUrl(data.receiptUrl);
    },
    onError: (err) => setError(err.response?.data?.error || t('fee.collection.paymentFailed')),
  });

  async function handlePayOnline() {
    setError('');
    try {
      const { data: orderData } = await api.post('/fee/payments/initiate', {
        assignmentId: assignment._id,
      });
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
            setError(t('fee.collection.verificationFailed'));
          }
        },
      });
      rzp.open();
    } catch {
      setError(t('fee.collection.initiateFailed'));
    }
  }

  const selectCls =
    'h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {receiptUrl || onlineSuccess || paymentSuccess
              ? t('fee.collection.paymentSuccessfulTitle')
              : t('fee.collection.collectPaymentTitle')}
          </DialogTitle>
        </DialogHeader>

        {receiptUrl || onlineSuccess || paymentSuccess ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {t('fee.collection.paymentRecordedSuccess')}
            </p>
            {receiptUrl && (
              <a
                href={receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-primary hover:underline text-sm font-medium"
              >
                {t('fee.collection.downloadReceiptPdf')}
              </a>
            )}
          </div>
        ) : (
          <form
            id="collect-payment"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
            className="flex flex-col gap-4"
          >
            <div className="text-sm text-muted-foreground rounded-lg bg-muted/50 px-3 py-2">
              {t('fee.collection.studentLabel')}{' '}
              <strong className="text-foreground">
                {assignment?.studentId?.firstName} {assignment?.studentId?.lastName}
              </strong>
              <br />
              {t('fee.collection.totalDueLabel')}{' '}
              <strong className="text-foreground">
                {formatCurrency((assignment?.totalAmount ?? 0) - (assignment?.discountAmount || 0))}
              </strong>
            </div>
            <Input
              label={t('fee.collection.amountLabel')}
              type="number"
              value={form.amount}
              onChange={update('amount')}
              required
              min="1"
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">{t('fee.collection.paymentMethod')}</label>
              <select
                value={form.paymentMethod}
                onChange={update('paymentMethod')}
                className={selectCls}
              >
                <option value="cash">{t('fee.collection.methodCash')}</option>
                <option value="card">{t('fee.collection.methodCard')}</option>
                <option value="upi">{t('fee.collection.methodUpi')}</option>
                <option value="bank_transfer">{t('fee.collection.methodBankTransfer')}</option>
                <option value="cheque">{t('fee.collection.methodCheque')}</option>
              </select>
            </div>
            <Input
              label={t('fee.collection.transactionIdOptional')}
              value={form.transactionId}
              onChange={update('transactionId')}
            />
            <Input
              label={t('fee.collection.notesOptional')}
              value={form.notes}
              onChange={update('notes')}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {receiptUrl || onlineSuccess || paymentSuccess ? t('common.close') : t('common.cancel')}
          </Button>
          {!receiptUrl && !onlineSuccess && !paymentSuccess && (
            <>
              <Button variant="outline" type="button" onClick={handlePayOnline}>
                {t('fee.collection.payOnline')}
              </Button>
              <Button type="submit" form="collect-payment" disabled={mutation.isPending}>
                {mutation.isPending
                  ? t('fee.collection.processing')
                  : t('fee.collection.recordPayment')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApplyDiscountModal({ open, onOpenChange, assignment }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [discountId, setDiscountId] = useState('');
  const [error, setError] = useState('');

  const { data: discounts = [] } = useQuery({
    queryKey: ['fee-discounts'],
    queryFn: () => api.get('/fee/discounts').then((r) => r.data),
    enabled: open,
  });

  function handleClose() {
    onOpenChange(false);
    setDiscountId('');
    setError('');
  }

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/fee/assignments/${assignment._id}/discount`, { discountId }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fee-assignments'] });
      handleClose();
    },
    onError: (err) =>
      setError(err.response?.data?.error || t('fee.collection.applyDiscountFailed')),
  });

  const selectCls =
    'h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('fee.collection.applyDiscountTitle')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {t('fee.collection.studentLabel')}{' '}
            <strong className="text-foreground">
              {assignment?.studentId?.firstName} {assignment?.studentId?.lastName}
            </strong>
          </p>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{t('fee.collection.discountLabel')}</label>
            <select
              aria-label={t('fee.collection.discountLabel')}
              value={discountId}
              onChange={(e) => setDiscountId(e.target.value)}
              className={selectCls}
            >
              <option value="">{t('fee.collection.selectDiscountPlaceholder')}</option>
              {discounts.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name} ({d.type === 'percentage' ? `${d.value}%` : formatCurrency(d.value)})
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!discountId || mutation.isPending}>
            {mutation.isPending ? t('fee.collection.applying') : t('fee.collection.apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WaiveAssignmentModal({ open, onOpenChange, assignment }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  function handleClose() {
    onOpenChange(false);
    setReason('');
    setError('');
  }

  const mutation = useMutation({
    mutationFn: () =>
      api
        .post(`/fee/assignments/${assignment._id}/waive`, { reason: reason || undefined })
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fee-assignments'] });
      handleClose();
    },
    onError: (err) => setError(err.response?.data?.error || t('fee.collection.waiveFailed')),
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('fee.collection.waiveTitle')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {t('fee.collection.waiveBody', {
              name: `${assignment?.studentId?.firstName ?? ''} ${assignment?.studentId?.lastName ?? ''}`.trim(),
            })}
          </p>
          <Input
            label={t('fee.collection.reasonOptional')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? t('fee.collection.waiving') : t('fee.collection.waive')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignmentsTab() {
  const { t } = useTranslation();
  const [studentSearch, setStudentSearch] = useState('');
  const [yearId, setYearId] = useState('');
  const [collectFor, setCollectFor] = useState(null);
  const [discountFor, setDiscountFor] = useState(null);
  const [waiveFor, setWaiveFor] = useState(null);

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
        <Input
          placeholder={t('fee.collection.searchStudentPlaceholder')}
          value={studentSearch}
          onChange={(e) => setStudentSearch(e.target.value)}
        />
        <select
          value={yearId}
          onChange={(e) => setYearId(e.target.value)}
          className="h-9 rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">{t('common.allYears')}</option>
          {years.map((y) => (
            <option key={y._id} value={y._id}>
              {y.name}
            </option>
          ))}
        </select>
      </div>

      <RecordList
        isLoading={isLoading}
        isEmpty={filtered.length === 0}
        emptyMessage={t('fee.collection.noAssignmentsFound')}
      >
        {filtered.map((a) => (
          <RecordListItem
            key={a._id}
            title={`${a.studentId?.firstName ?? ''} ${a.studentId?.lastName ?? ''}`.trim()}
            meta={`${a.studentId?.admissionNo ?? '—'} · ${a.feeStructureId?.name ?? '—'} · ${formatCurrency(
              a.totalAmount ?? 0
            )}${a.dueDate ? ` · ${new Date(a.dueDate).toLocaleDateString()}` : ''}`}
            trailing={<Badge variant={statusVariant(a.status)}>{a.status}</Badge>}
            footer={
              a.status !== 'paid' &&
              a.status !== 'waived' && (
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" onClick={() => setCollectFor(a)}>
                    {t('fee.collection.collectButton')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDiscountFor(a)}>
                    {t('fee.collection.discountButton')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setWaiveFor(a)}>
                    {t('fee.collection.waive')}
                  </Button>
                </div>
              )
            }
          />
        ))}
      </RecordList>

      <DataTable
        className="hidden md:block"
        headers={[
          t('fee.collection.tableStudent'),
          t('fee.collection.tableAdmissionNo'),
          t('fee.collection.tableStructure'),
          t('fee.collection.tableTotal'),
          t('fee.collection.tableDiscount'),
          t('common.status'),
          t('fee.collection.tableDueDate'),
          t('fee.collection.tableAction'),
        ]}
        isLoading={isLoading}
        isEmpty={filtered.length === 0}
        emptyMessage={t('fee.collection.noAssignmentsFound')}
      >
        {filtered.map((a) => (
          <TableRow key={a._id} className="bg-card">
            <TableCell className="px-4 py-3">
              {a.studentId?.firstName} {a.studentId?.lastName}
            </TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">
              {a.studentId?.admissionNo}
            </TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">
              {a.feeStructureId?.name}
            </TableCell>
            <TableCell className="px-4 py-3">{formatCurrency(a.totalAmount ?? 0)}</TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">
              {formatCurrency(a.discountAmount ?? 0)}
            </TableCell>
            <TableCell className="px-4 py-3">
              <Badge variant={statusVariant(a.status)}>{a.status}</Badge>
            </TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">
              {a.dueDate ? new Date(a.dueDate).toLocaleDateString() : '—'}
            </TableCell>
            <TableCell className="px-4 py-3">
              {a.status !== 'paid' && a.status !== 'waived' && (
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={() => setCollectFor(a)}>
                    {t('fee.collection.collectButton')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDiscountFor(a)}>
                    {t('fee.collection.discountButton')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setWaiveFor(a)}>
                    {t('fee.collection.waive')}
                  </Button>
                </div>
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
      <ApplyDiscountModal
        open={Boolean(discountFor)}
        onOpenChange={(v) => !v && setDiscountFor(null)}
        assignment={discountFor}
      />
      <WaiveAssignmentModal
        open={Boolean(waiveFor)}
        onOpenChange={(v) => !v && setWaiveFor(null)}
        assignment={waiveFor}
      />
    </div>
  );
}

function RefundPaymentModal({ open, onOpenChange, payment }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  function handleClose() {
    onOpenChange(false);
    setReason('');
    setError('');
  }

  const mutation = useMutation({
    mutationFn: () =>
      api
        .post(`/fee/payments/${payment._id}/refund`, { reason: reason || undefined })
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fee-payments'] });
      queryClient.invalidateQueries({ queryKey: ['fee-assignments'] });
      handleClose();
    },
    onError: (err) => setError(err.response?.data?.error || t('fee.collection.refundFailed')),
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('fee.collection.refundPaymentTitle')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {t('fee.collection.refundBody', {
              receiptNumber: payment?.receiptNumber,
              amount: formatCurrency(payment?.amount ?? 0),
            })}
          </p>
          <Input
            label={t('fee.collection.reasonOptional')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? t('fee.collection.refunding') : t('fee.collection.refundButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentsTab() {
  const { t } = useTranslation();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [refundFor, setRefundFor] = useState(null);

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

      <RecordList
        isLoading={isLoading}
        isEmpty={payments.length === 0}
        emptyMessage={t('fee.collection.noPaymentsFound')}
      >
        {payments.map((p) => (
          <RecordListItem
            key={p._id}
            title={`${p.studentId?.firstName ?? ''} ${p.studentId?.lastName ?? ''}`.trim()}
            meta={`${p.receiptNumber} · ${formatCurrency(p.amount ?? 0)} · ${p.paymentMethod}${
              p.paymentDate ? ` · ${new Date(p.paymentDate).toLocaleDateString()}` : ''
            }`}
            trailing={
              p.refunded ? (
                <Badge variant="danger">{t('fee.collection.refundedBadge')}</Badge>
              ) : null
            }
            footer={
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => downloadReceipt(p._id)}>
                  {t('fee.collection.downloadButton')}
                </Button>
                {!p.refunded && (
                  <Button size="sm" variant="outline" onClick={() => setRefundFor(p)}>
                    {t('fee.collection.refundButton')}
                  </Button>
                )}
              </div>
            }
          />
        ))}
      </RecordList>

      <DataTable
        className="hidden md:block"
        headers={[
          t('fee.collection.tableReceiptNo'),
          t('fee.collection.tableStudent'),
          t('fee.collection.tableAmount'),
          t('fee.collection.tableMethod'),
          t('fee.collection.tableDate'),
          t('fee.collection.tableCollectedBy'),
          t('fee.collection.tableReceipt'),
          t('fee.collection.tableRefund'),
        ]}
        isLoading={isLoading}
        isEmpty={payments.length === 0}
        emptyMessage={t('fee.collection.noPaymentsFound')}
      >
        {payments.map((p) => (
          <TableRow key={p._id} className="bg-card">
            <TableCell className="px-4 py-3 font-mono text-xs">{p.receiptNumber}</TableCell>
            <TableCell className="px-4 py-3">
              {p.studentId?.firstName} {p.studentId?.lastName}
            </TableCell>
            <TableCell className="px-4 py-3">{formatCurrency(p.amount ?? 0)}</TableCell>
            <TableCell className="px-4 py-3 capitalize">{p.paymentMethod}</TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">
              {p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : '—'}
            </TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">
              {p.collectedBy?.email}
            </TableCell>
            <TableCell className="px-4 py-3">
              <Button size="sm" variant="outline" onClick={() => downloadReceipt(p._id)}>
                {t('fee.collection.downloadButton')}
              </Button>
            </TableCell>
            <TableCell className="px-4 py-3">
              {p.refunded ? (
                <Badge variant="danger">{t('fee.collection.refundedBadge')}</Badge>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setRefundFor(p)}>
                  {t('fee.collection.refundButton')}
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </DataTable>

      <RefundPaymentModal
        open={Boolean(refundFor)}
        onOpenChange={(v) => !v && setRefundFor(null)}
        payment={refundFor}
      />
    </div>
  );
}

function DefaultersTab() {
  const { t } = useTranslation();
  const [yearId, setYearId] = useState('');

  const { data: years = [] } = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => api.get('/academic/years').then((r) => r.data),
  });

  // NOTE: GET /fee/defaulters is unpaginated (414 rows / ~430KB at current
  // scale) — known limitation, not fixed by this pass. Flagged for a future
  // pagination pass rather than silently ignored (see spec §5).
  const { data: defaulters = [], isLoading } = useQuery({
    queryKey: ['fee-defaulters', yearId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (yearId) params.set('yearId', yearId);
      return api.get(`/fee/defaulters?${params}`).then((r) => r.data);
    },
  });

  // Worst-overdue first — the longest-outstanding cases should surface first.
  const sorted = [...defaulters].sort((a, b) => b.daysOverdue - a.daysOverdue);
  const totalOutstanding = sorted.reduce(
    (sum, d) => sum + (d.totalAmount - (d.discountAmount || 0)),
    0
  );

  return (
    <div className="flex flex-col gap-4">
      {!isLoading && (
        <p className="text-sm text-muted-foreground">
          {t('fee.collection.outstandingSummary', {
            count: sorted.length,
            amount: formatCurrency(totalOutstanding),
          })}
        </p>
      )}

      <div className="flex gap-3">
        <select
          value={yearId}
          onChange={(e) => setYearId(e.target.value)}
          className="h-9 rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">{t('common.allYears')}</option>
          {years.map((y) => (
            <option key={y._id} value={y._id}>
              {y.name}
            </option>
          ))}
        </select>
      </div>

      <RecordList
        isLoading={isLoading}
        isEmpty={sorted.length === 0}
        emptyMessage={t('fee.collection.nothingOutstanding')}
      >
        {sorted.map((d) => (
          <RecordListItem
            key={d._id}
            title={`${d.studentId?.firstName ?? ''} ${d.studentId?.lastName ?? ''}`.trim()}
            meta={`${d.studentId?.admissionNo ?? '—'} · ${formatCurrency(
              d.totalAmount - (d.discountAmount || 0)
            )}${d.dueDate ? ` · ${new Date(d.dueDate).toLocaleDateString()}` : ''}`}
            trailing={
              <>
                <Badge variant={statusVariant(d.status)}>{d.status}</Badge>
                <span className="text-sm font-medium text-destructive">{d.daysOverdue}</span>
              </>
            }
          />
        ))}
      </RecordList>

      <DataTable
        className="hidden md:block"
        headers={[
          t('fee.collection.tableStudent'),
          t('fee.collection.tableAdmissionNo'),
          t('fee.collection.tableAmountDue'),
          t('common.status'),
          t('fee.collection.tableDueDate'),
          t('fee.collection.tableDaysOverdue'),
        ]}
        isLoading={isLoading}
        isEmpty={sorted.length === 0}
        emptyMessage={t('fee.collection.nothingOutstanding')}
      >
        {sorted.map((d) => (
          <TableRow key={d._id} className="bg-card">
            <TableCell className="px-4 py-3">
              {d.studentId?.firstName} {d.studentId?.lastName}
            </TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">
              {d.studentId?.admissionNo}
            </TableCell>
            <TableCell className="px-4 py-3">
              {formatCurrency(d.totalAmount - (d.discountAmount || 0))}
            </TableCell>
            <TableCell className="px-4 py-3">
              <Badge variant={statusVariant(d.status)}>{d.status}</Badge>
            </TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">
              {d.dueDate ? new Date(d.dueDate).toLocaleDateString() : '—'}
            </TableCell>
            <TableCell className="px-4 py-3 text-destructive font-medium">
              {d.daysOverdue}
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
    </div>
  );
}

export default function FeesPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('defaulters');

  const TAB_LABELS = {
    defaulters: t('fee.collection.tabDefaulters'),
    assignments: t('fee.collection.tabAssignments'),
    payments: t('fee.collection.tabPayments'),
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('nav.feeCollection')} />

      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {TAB_IDS.map((id) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={[
              'shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {TAB_LABELS[id]}
          </button>
        ))}
      </div>

      {activeTab === 'defaulters' && <DefaultersTab />}
      {activeTab === 'assignments' && <AssignmentsTab />}
      {activeTab === 'payments' && <PaymentsTab />}
    </div>
  );
}
