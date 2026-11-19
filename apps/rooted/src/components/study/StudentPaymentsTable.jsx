import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';
import { DataTable, TableRow, TableCell } from '../ui/DataTable.jsx';
import RefundPaymentModal from '../fee/RefundPaymentModal.jsx';
import { formatCurrency, formatDate } from '../../utils/intl.js';
import { apiError } from '../../utils/studyCenter.js';

const PAGE_SIZE = 8;
// The payments endpoint is unpaged; one learner has few, so ask for a generous cap.
const FETCH_LIMIT = 200;

/**
 * Every payment taken from one learner, newest first, each with its receipt. The owner
 * (`canRefund`) can refund one; `onDone` lets the page refresh what a refund changes.
 */
export default function StudentPaymentsTable({ studentId, canRefund = false, onDone }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [refunding, setRefunding] = useState(null);
  const prefix = 'studyCenter.studentBilling';

  const {
    data: payments = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['student-payments', studentId],
    queryFn: () =>
      api.get('/fee/payments', { params: { studentId, limit: FETCH_LIMIT } }).then((r) => r.data),
  });

  async function openReceipt(paymentId) {
    setError('');
    try {
      const { data } = await api.get(`/fee/payments/${paymentId}/receipt`);
      if (data.url) window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(apiError(err, t(`${prefix}.receiptFailed`)));
    }
  }

  const pages = Math.max(1, Math.ceil(payments.length / PAGE_SIZE));
  const shown = payments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-2">
      <DataTable
        headers={[
          t(`${prefix}.paymentDate`),
          t(`${prefix}.paymentAmount`),
          t(`${prefix}.paymentMethod`),
          t(`${prefix}.receiptNo`),
          t(`${prefix}.collectedBy`),
          '',
        ]}
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        isEmpty={payments.length === 0}
        emptyMessage={t(`${prefix}.noPayments`)}
      >
        {shown.map((p) => (
          <TableRow key={p._id}>
            <TableCell className="px-4 py-2">{formatDate(p.paymentDate)}</TableCell>
            <TableCell className="px-4 py-2">
              {formatCurrency(p.amount)}
              {p.refunded && (
                <Badge variant="danger" className="ml-2">
                  {t(`${prefix}.refunded`)}
                </Badge>
              )}
            </TableCell>
            <TableCell className="px-4 py-2">{t(`${prefix}.methods.${p.paymentMethod}`)}</TableCell>
            <TableCell className="px-4 py-2 font-mono text-xs">{p.receiptNumber}</TableCell>
            <TableCell className="px-4 py-2 text-muted-foreground">
              {p.collectedBy?.email ?? '—'}
            </TableCell>
            <TableCell className="px-4 py-2 text-right">
              <span className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => openReceipt(p._id)}>
                  {t(`${prefix}.receipt`)}
                </Button>
                {canRefund && !p.refunded && (
                  <Button variant="outline" size="sm" onClick={() => setRefunding(p)}>
                    {t(`${prefix}.refund`)}
                  </Button>
                )}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {refunding && (
        <RefundPaymentModal
          open
          onOpenChange={(open) => !open && setRefunding(null)}
          payment={refunding}
          onDone={onDone}
        />
      )}

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            {t('studyCenter.studentVisits.previous')}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t('studyCenter.studentVisits.pageOfTotal', { page, total: pages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page >= pages}
          >
            {t('studyCenter.studentVisits.next')}
          </Button>
        </div>
      )}
    </div>
  );
}
