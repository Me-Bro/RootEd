import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CENTRE_EXPENSE_CATEGORIES } from '@rooted/shared/constants';
import api from '../../lib/api.js';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { DataTable, TableRow, TableCell } from '../../components/ui/DataTable.jsx';
import { RecordList, RecordListItem } from '../../components/ui/RecordList.jsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog.jsx';
import { formatCurrency, formatDate } from '../../utils/intl.js';
import { apiError, localMonthString } from '../../utils/studyCenter.js';

const METHODS = ['cash', 'upi', 'bank_transfer', 'card'];
const METHOD_KEYS = {
  cash: 'expense.entries.methodCash',
  upi: 'expense.entries.methodUpi',
  bank_transfer: 'expense.entries.methodBankTransfer',
  card: 'expense.entries.methodCard',
};
const EMPTY = { category: 'rent', amount: '', date: '', title: '', vendor: '', paymentMethod: '' };
const selectCls =
  'h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

// First and last day of a YYYY-MM month. Entries hold their day as a UTC-midnight
// date, so these are compared as plain calendar days.
function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  return { from: `${month}-01`, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
}

function ExpenseDialog({ entry, onClose }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(
    entry
      ? {
          category: entry.category,
          amount: String(entry.amount),
          date: entry.invoiceDate?.slice(0, 10) ?? '',
          // The title mirrors the category unless the owner wrote a note.
          title: entry.title === entry.category ? '' : (entry.title ?? ''),
          vendor: entry.vendor ?? '',
          paymentMethod: entry.paymentMethod ?? '',
        }
      : EMPTY
  );
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const save = useMutation({
    mutationFn: () => {
      const body = { category: form.category, amount: Number(form.amount) };
      // Left blank, the server records today on the centre's own calendar.
      if (form.date) body.date = form.date;
      if (form.title) body.title = form.title;
      else if (entry) body.title = form.category;
      if (form.vendor) body.vendor = form.vendor;
      if (form.paymentMethod) body.paymentMethod = form.paymentMethod;
      return entry
        ? api.patch(`/expense/entries/${entry._id}`, body)
        : api.post('/expense/entries', body);
    },
    onSuccess: () => {
      toast.success(t('expense.centre.saved'));
      queryClient.invalidateQueries({ queryKey: ['centre-expenses'] });
      onClose();
    },
    onError: (err) => toast.error(apiError(err, t('expense.centre.saveFailed'))),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {entry ? t('expense.centre.editTitle') : t('expense.centre.addTitle')}
          </DialogTitle>
        </DialogHeader>
        <form
          id="centre-expense"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="expense-category" className="text-sm font-medium">
              {t('expense.centre.category')}
            </label>
            <select
              id="expense-category"
              value={form.category}
              onChange={set('category')}
              className={selectCls}
            >
              {CENTRE_EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`expense.centre.categories.${c}`)}
                </option>
              ))}
            </select>
          </div>
          <Input
            id="expense-amount"
            label={t('expense.centre.amount')}
            type="number"
            min="1"
            step="any"
            value={form.amount}
            onChange={set('amount')}
            required
          />
          <Input
            id="expense-date"
            label={t('expense.centre.date')}
            type="date"
            value={form.date}
            onChange={set('date')}
          />
          <Input
            id="expense-note"
            label={t('expense.centre.note')}
            placeholder={t('expense.centre.noteHint')}
            value={form.title}
            onChange={set('title')}
          />
          <Input
            id="expense-vendor"
            label={t('expense.centre.vendor')}
            value={form.vendor}
            onChange={set('vendor')}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="expense-method" className="text-sm font-medium">
              {t('expense.centre.paymentMethod')}
            </label>
            <select
              id="expense-method"
              value={form.paymentMethod}
              onChange={set('paymentMethod')}
              className={selectCls}
            >
              <option value="">{t('expense.entries.selectPlaceholder')}</option>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(METHOD_KEYS[m])}
                </option>
              ))}
            </select>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="centre-expense" disabled={save.isPending}>
            {save.isPending ? t('expense.centre.saving') : t('expense.centre.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// A study center's expenses: no approvals, a fixed category list, one month at a time.
export default function CentreExpensesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(localMonthString());
  const [editing, setEditing] = useState(null); // null = closed, {} = new, entry = edit

  const {
    data: entries = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['centre-expenses', month],
    queryFn: () => api.get('/expense/entries', { params: monthRange(month) }).then((r) => r.data),
    enabled: Boolean(month),
  });

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/expense/entries/${id}`),
    onSuccess: () => {
      toast.success(t('expense.centre.deleted'));
      queryClient.invalidateQueries({ queryKey: ['centre-expenses'] });
    },
    onError: (err) => toast.error(apiError(err, t('expense.centre.deleteFailed'))),
  });

  const total = entries.reduce((sum, e) => sum + (e.amount ?? 0), 0);
  const confirmDelete = (id) => {
    if (window.confirm(t('expense.centre.deleteConfirm'))) remove.mutate(id);
  };
  const label = (e) => t(`expense.centre.categories.${e.category}`, { defaultValue: e.category });
  const note = (e) => (e.title && e.title !== e.category ? e.title : null);

  const actions = (e) => (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => setEditing(e)}>
        {t('expense.centre.edit')}
      </Button>
      <Button size="sm" variant="outline" onClick={() => confirmDelete(e._id)}>
        {t('expense.centre.delete')}
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('expense.centre.title')}
        description={t('expense.centre.description')}
        action={<Button onClick={() => setEditing({})}>{t('expense.centre.add')}</Button>}
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="max-w-xs">
          <Input
            id="expense-month"
            type="month"
            label={t('expense.centre.month')}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        <div className="rounded-lg border border-border px-4 py-2" data-testid="expense-total">
          <p className="text-xs text-muted-foreground">{t('expense.centre.total')}</p>
          <p className="text-xl font-semibold">{formatCurrency(total)}</p>
          <p className="text-xs text-muted-foreground">
            {t('expense.centre.count', { count: entries.length })}
          </p>
        </div>
      </div>

      <RecordList
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        isEmpty={entries.length === 0}
        emptyMessage={t('expense.centre.none')}
      >
        {entries.map((e) => (
          <RecordListItem
            key={e._id}
            title={`${label(e)} · ${formatCurrency(e.amount ?? 0)}`}
            meta={[formatDate(e.invoiceDate), note(e), e.vendor].filter(Boolean).join(' · ')}
            footer={actions(e)}
          />
        ))}
      </RecordList>

      <DataTable
        className="hidden md:block"
        headers={[
          t('expense.centre.date'),
          t('expense.centre.category'),
          t('expense.centre.amount'),
          t('expense.centre.note'),
          t('expense.centre.vendor'),
          t('expense.centre.actions'),
        ]}
        isLoading={isLoading}
        isEmpty={entries.length === 0}
        emptyMessage={t('expense.centre.none')}
      >
        {entries.map((e) => (
          <TableRow key={e._id} className="bg-card">
            <TableCell className="px-4 py-3">{formatDate(e.invoiceDate)}</TableCell>
            <TableCell className="px-4 py-3 font-medium">{label(e)}</TableCell>
            <TableCell className="px-4 py-3">{formatCurrency(e.amount ?? 0)}</TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">{note(e) || '—'}</TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">{e.vendor || '—'}</TableCell>
            <TableCell className="px-4 py-3">{actions(e)}</TableCell>
          </TableRow>
        ))}
      </DataTable>

      {editing && (
        <ExpenseDialog entry={editing._id ? editing : null} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
