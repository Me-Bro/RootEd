import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog.jsx';
import { formatCurrency } from '../../utils/intl.js';
import { assignmentRow } from '../../utils/feePlan.js';

// Takes a payment against one fee assignment (cash, card, UPI and so on, or online). Used by
// the Fees page and by a learner's own page.
export default function CollectPaymentModal({
  open,
  onOpenChange,
  assignment,
  learnerName,
  onDone,
}) {
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
  // A monthly/weekly plan may be paid ahead, so its cap is more than what is overdue.
  const payable = assignment ? assignmentRow(assignment).payable : 0;

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
      queryClient.invalidateQueries({ queryKey: ['fee-defaulters'] });
      onDone?.();
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
                {learnerName ??
                  `${assignment?.studentId?.firstName ?? ''} ${assignment?.studentId?.lastName ?? ''}`.trim()}
              </strong>
              <br />
              {t('fee.collection.totalDueLabel')}{' '}
              <strong className="text-foreground">{formatCurrency(payable)}</strong>
            </div>
            <Input
              label={t('fee.collection.amountLabel')}
              type="number"
              value={form.amount}
              onChange={update('amount')}
              required
              min="1"
              max={payable || undefined}
              placeholder={payable ? String(payable) : undefined}
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
