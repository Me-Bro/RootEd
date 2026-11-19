import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog.jsx';
import { formatCurrency } from '../../utils/intl.js';

// Refunds one payment (the owner only; the server decides).
export default function RefundPaymentModal({ open, onOpenChange, payment, onDone }) {
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
      onDone?.();
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
