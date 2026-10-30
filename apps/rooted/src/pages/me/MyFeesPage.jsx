import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Card, CardContent } from '../../components/ui/Card.jsx';
import { DataTable, TableRow, TableCell } from '../../components/ui/DataTable.jsx';
import { formatDate, formatCurrency } from '../../utils/intl.js';

const STATUS_VARIANT = { paid: 'success', partial: 'warning', unpaid: 'danger', waived: 'default' };

export default function MyFeesPage() {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ['me', 'fees'],
    queryFn: () => api.get('/me/fees').then((r) => r.data),
  });

  const assignments = data?.assignments ?? [];
  const payments = data?.payments ?? [];

  const totalDue = assignments.reduce((sum, a) => sum + a.totalAmount - (a.discountAmount || 0), 0);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const balance = totalDue - totalPaid;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('fee.myFees.title')} />

      {!isLoading && (
        <Card>
          <CardContent className="grid grid-cols-1 gap-3 pt-4 sm:grid-cols-3">
            <p className="text-sm">
              {t('academic.studentDetail.totalDue', { amount: formatCurrency(totalDue) })}
            </p>
            <p className="text-sm">
              {t('academic.studentDetail.totalPaid', { amount: formatCurrency(totalPaid) })}
            </p>
            <p
              className={`text-sm ${balance > 0 ? 'text-destructive font-medium' : 'text-emerald-600'}`}
            >
              {t('academic.studentDetail.balance', { amount: formatCurrency(balance) })}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">
          {t('fee.myFees.assignmentsTitle')}
        </h2>
        <DataTable
          headers={[
            t('fee.myFees.columnDueDate'),
            t('fee.myFees.columnAmount'),
            t('common.status'),
          ]}
          isLoading={isLoading}
          isEmpty={!isLoading && assignments.length === 0}
          emptyMessage={t('fee.myFees.noAssignments')}
        >
          {assignments.map((a) => (
            <TableRow key={a._id}>
              <TableCell className="px-4 py-2">{a.dueDate ? formatDate(a.dueDate) : '—'}</TableCell>
              <TableCell className="px-4 py-2">
                {formatCurrency(a.totalAmount - (a.discountAmount || 0))}
              </TableCell>
              <TableCell className="px-4 py-2">
                <Badge variant={STATUS_VARIANT[a.status] ?? 'default'} className="capitalize">
                  {a.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">{t('fee.myFees.paymentsTitle')}</h2>
        <DataTable
          headers={[
            t('fee.myFees.columnPaidOn'),
            t('fee.myFees.columnAmount'),
            t('fee.myFees.columnMethod'),
            t('fee.myFees.columnReceipt'),
          ]}
          isLoading={isLoading}
          isEmpty={!isLoading && payments.length === 0}
          emptyMessage={t('fee.myFees.noPayments')}
        >
          {payments.map((p) => (
            <TableRow key={p._id}>
              <TableCell className="px-4 py-2">{formatDate(p.paymentDate)}</TableCell>
              <TableCell className="px-4 py-2">{formatCurrency(p.amount)}</TableCell>
              <TableCell className="px-4 py-2 capitalize">{p.paymentMethod}</TableCell>
              <TableCell className="px-4 py-2 font-mono text-xs">{p.receiptNumber}</TableCell>
            </TableRow>
          ))}
        </DataTable>
      </div>
    </div>
  );
}
