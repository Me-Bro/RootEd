import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
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
import ApprovalQueueCard from '../../components/expense/ApprovalQueueCard.jsx';

const STATUS_TAB_IDS = ['all', 'pending', 'approved', 'rejected', 'paid'];

function statusVariant(status) {
  if (status === 'approved' || status === 'paid') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'rejected') return 'danger';
  return 'default';
}

// docs/mobile-ui/14-expenses-approved.html §3 — joins a pending entry to its
// cost center's *annual* budget so the approval queue can show spend-to-date.
// Entries/budgets are both populated with a costCenterId object by the API,
// so comparisons are done on the id string rather than object identity.
function budgetFor(costCenterId, budgets) {
  if (!costCenterId) return undefined;
  return budgets.find((b) => {
    const budgetCostCenterId = b.costCenterId?._id ?? b.costCenterId;
    return String(budgetCostCenterId) === String(costCenterId) && b.period === 'annual';
  });
}

function NewExpenseModal({ open, onOpenChange, costCenters }) {
  const { t } = useTranslation();
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
    onError: (err) => setError(err.response?.data?.error || t('expense.entries.createFailed')),
  });

  const selectCls =
    'h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('expense.entries.newExpense')}</DialogTitle>
        </DialogHeader>
        <form
          id="new-expense"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(form);
          }}
          className="flex flex-col gap-4"
        >
          <Input
            label={t('expense.entries.titleLabel')}
            value={form.title}
            onChange={update('title')}
            required
          />
          <Input
            label={t('expense.entries.categoryLabel')}
            value={form.category}
            onChange={update('category')}
            required
          />
          <Input
            label={t('expense.entries.amountInrLabel')}
            type="number"
            value={form.amount}
            onChange={update('amount')}
            required
            min="0"
          />
          <Input
            label={t('expense.entries.vendorLabel')}
            value={form.vendor}
            onChange={update('vendor')}
          />
          <Input
            label={t('expense.entries.invoiceDateLabel')}
            type="date"
            value={form.invoiceDate}
            onChange={update('invoiceDate')}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{t('expense.entries.costCenterLabel')}</label>
            <select
              value={form.costCenterId}
              onChange={update('costCenterId')}
              className={selectCls}
            >
              <option value="">{t('expense.entries.noneOption')}</option>
              {costCenters.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{t('expense.entries.paymentMethodLabel')}</label>
            <select
              value={form.paymentMethod}
              onChange={update('paymentMethod')}
              className={selectCls}
            >
              <option value="">{t('expense.entries.selectPlaceholder')}</option>
              <option value="cash">{t('expense.entries.methodCash')}</option>
              <option value="card">{t('expense.entries.methodCard')}</option>
              <option value="bank_transfer">{t('expense.entries.methodBankTransfer')}</option>
              <option value="upi">{t('expense.entries.methodUpi')}</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isReimbursement}
              onChange={update('isReimbursement')}
            />
            <span>{t('expense.entries.isReimbursement')}</span>
          </label>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{t('expense.entries.attachmentLabel')}</label>
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
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="new-expense" disabled={mutation.isPending}>
            {mutation.isPending ? t('expense.entries.submitting') : t('expense.entries.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectModal({ open, onOpenChange, entryId }) {
  const { t } = useTranslation();
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
    onError: (err) => setError(err.response?.data?.error || t('expense.entries.rejectFailed')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('expense.entries.rejectExpenseTitle')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('expense.entries.reasonPlaceholder')}
            rows={3}
            className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? t('expense.entries.rejecting') : t('expense.entries.reject')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ExpensesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('all');
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
      if (activeTab !== 'all') params.set('status', activeTab);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (costCenterId) params.set('costCenterId', costCenterId);
      return api.get(`/expense/entries?${params}`).then((r) => r.data);
    },
  });

  const isPendingTab = activeTab === 'pending';

  // Budget context is only ever shown on the pending-approval queue (mock 2),
  // so this query is skipped for every other tab.
  const { data: budgets = [] } = useQuery({
    queryKey: ['expense-budgets', new Date().getFullYear()],
    queryFn: () => api.get(`/expense/budgets?year=${new Date().getFullYear()}`).then((r) => r.data),
    enabled: isPendingTab,
  });

  const approveMutation = useMutation({
    mutationFn: (id) => api.patch(`/expense/entries/${id}/approve`).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expense-entries'] }),
  });

  const pendingTotal = entries.reduce((sum, e) => sum + (e.amount ?? 0), 0);

  const STATUS_TAB_LABELS = {
    all: t('expense.entries.tabAll'),
    pending: t('expense.entries.tabPending'),
    approved: t('expense.entries.tabApproved'),
    rejected: t('expense.entries.tabRejected'),
    paid: t('expense.entries.tabPaid'),
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('nav.expenses')}
        description={
          isPendingTab && entries.length > 0
            ? t('expense.entries.pendingSummary', {
                count: entries.length,
                amount: formatCurrency(pendingTotal),
              })
            : undefined
        }
        action={<Button onClick={() => setShowNew(true)}>{t('expense.entries.newExpense')}</Button>}
      />

      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {STATUS_TAB_IDS.map((id) => (
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
            {STATUS_TAB_LABELS[id]}
          </button>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <select
          value={costCenterId}
          onChange={(e) => setCostCenterId(e.target.value)}
          className="h-9 rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">{t('expense.entries.allCostCenters')}</option>
          {costCenters.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {error && <p className="text-destructive">{t('expense.entries.loadFailed')}</p>}

      {isPendingTab ? (
        // Mock 2 (approved) — approval queue with budget-in-context, replacing
        // the table for the one view where a decision actually has to be made.
        isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('expense.entries.loadingExpenses')}
          </p>
        ) : entries.length === 0 ? (
          <EmptyState
            title={t('expense.entries.noPendingTitle')}
            description={t('expense.entries.noPendingDescription')}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {entries.map((e) => (
              <ApprovalQueueCard
                key={e._id}
                entry={e}
                budget={budgetFor(e.costCenterId?._id, budgets)}
                onApprove={(id) => approveMutation.mutate(id)}
                onReject={(id) => setRejectId(id)}
                isApproving={approveMutation.isPending && approveMutation.variables === e._id}
              />
            ))}
          </div>
        )
      ) : (
        <>
          <RecordList
            isLoading={isLoading}
            isEmpty={entries.length === 0}
            emptyMessage={t('expense.entries.noneFound')}
          >
            {entries.map((e) => (
              <RecordListItem
                key={e._id}
                title={e.title}
                meta={`${e.category} · ${formatCurrency(e.amount ?? 0)}${
                  e.vendor ? ` · ${e.vendor}` : ''
                }${e.costCenterId?.name ? ` · ${e.costCenterId.name}` : ''}`}
                trailing={<Badge variant={statusVariant(e.status)}>{e.status}</Badge>}
                footer={
                  e.status === 'pending' && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => approveMutation.mutate(e._id)}
                        disabled={approveMutation.isPending}
                      >
                        {t('expense.entries.approve')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setRejectId(e._id)}>
                        {t('expense.entries.reject')}
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
              t('expense.entries.tableTitle'),
              t('expense.entries.tableCategory'),
              t('expense.entries.tableAmount'),
              t('expense.entries.tableVendor'),
              t('expense.entries.tableCostCenter'),
              t('common.status'),
              t('expense.entries.tableSubmittedBy'),
              t('common.actions'),
            ]}
            isLoading={isLoading}
            isEmpty={entries.length === 0}
            emptyMessage={t('expense.entries.noneFound')}
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
                        {t('expense.entries.approve')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setRejectId(e._id)}>
                        {t('expense.entries.reject')}
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </DataTable>
        </>
      )}

      <NewExpenseModal open={showNew} onOpenChange={setShowNew} costCenters={costCenters} />
      <RejectModal
        open={Boolean(rejectId)}
        onOpenChange={(v) => !v && setRejectId(null)}
        entryId={rejectId}
      />
    </div>
  );
}
