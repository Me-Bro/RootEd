import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { DataTable, TableRow, TableCell } from '../../components/ui/DataTable.jsx';
import { formatDate } from '../../utils/intl.js';

export default function MyAttendancePage() {
  const { t } = useTranslation();

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['me', 'attendance'],
    queryFn: () => api.get('/me/attendance').then((r) => r.data),
  });

  const present = records.filter((r) => r.status === 'present' || r.status === 'late').length;
  const pct = records.length > 0 ? Math.round((present / records.length) * 100) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('academic.myAttendance.title')} />

      {!isLoading && pct !== null && (
        <p className="text-sm text-muted-foreground">
          {t('academic.studentDetail.presentDaysSummary', {
            pct,
            present,
            total: records.length,
          })}
        </p>
      )}

      <DataTable
        headers={[t('academic.myAttendance.columnDate'), t('common.status')]}
        isLoading={isLoading}
        isEmpty={!isLoading && records.length === 0}
        emptyMessage={t('academic.studentDetail.noAttendanceRecords')}
      >
        {records.map((r) => (
          <TableRow key={r._id}>
            <TableCell className="px-4 py-2">{formatDate(r.date)}</TableCell>
            <TableCell className="px-4 py-2">
              <Badge variant={r.status === 'present' ? 'success' : 'danger'} className="capitalize">
                {r.status}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
    </div>
  );
}
