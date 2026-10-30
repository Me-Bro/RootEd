import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import api from '../../lib/api.js';
import { formatDate } from '../../utils/intl.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card, CardContent } from '../../components/ui/Card.jsx';
import { DataTable, TableRow, TableCell } from '../../components/ui/DataTable.jsx';

function todayParam() {
  return new Date().toISOString().slice(0, 10);
}

export default function StaffSummaryPage() {
  const { t } = useTranslation();
  const today = todayParam();

  const { data: attendance = [] } = useQuery({
    queryKey: ['staff', 'attendance', today],
    queryFn: () => api.get('/staff/attendance', { params: { date: today } }).then((r) => r.data),
  });

  const { data: leaveData, isLoading: loadingLeave } = useQuery({
    queryKey: ['staff', 'leave-requests', 'pending-preview'],
    queryFn: () =>
      api
        .get('/staff/leave-requests', { params: { status: 'pending', limit: 5 } })
        .then((r) => r.data),
  });

  const present = attendance.filter((r) => r.status === 'present').length;
  const absent = attendance.filter((r) => r.status === 'absent').length;
  const late = attendance.filter((r) => r.status === 'late').length;
  const attendancePct = attendance.length
    ? Math.round(((present + late) / attendance.length) * 1000) / 10
    : null;

  const pendingRequests = leaveData?.requests ?? [];

  return (
    <div className="flex flex-col gap-5">
      <Link to="/dashboard" className="text-sm text-muted-foreground hover:underline w-fit">
        {t('common.backToDashboard')}
      </Link>
      <PageHeader title={t('dashboard.staffSummary.title')} />

      <Card>
        <CardContent className="pt-4">
          <p className="text-sm font-medium text-muted-foreground">
            {t('dashboard.staffSummary.attendanceCard')}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground">
              {attendancePct !== null ? `${attendancePct}%` : '—'}
            </span>
            <span className="text-sm text-muted-foreground">
              {t('dashboard.staffSummary.staffSuffix', { count: attendance.length })}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
            <div>
              <p className="font-semibold text-green-700 dark:text-green-500">{present}</p>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.academicSummary.presentLabel')}
              </p>
            </div>
            <div>
              <p className="font-semibold text-destructive">{absent}</p>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.academicSummary.absentLabel')}
              </p>
            </div>
            <div>
              <p className="font-semibold text-yellow-700 dark:text-yellow-500">{late}</p>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.academicSummary.lateLabel')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <p className="mb-2 text-sm font-medium text-muted-foreground">
          {leaveData ? t('dashboard.staffSummary.leaveCard', { count: leaveData.total }) : '—'}
        </p>
        <DataTable
          headers={[
            t('dashboard.staffSummary.tableStaff'),
            t('dashboard.staffSummary.tableType'),
            t('dashboard.staffSummary.tableDates'),
            t('dashboard.staffSummary.tableDays'),
          ]}
          isLoading={loadingLeave}
          isEmpty={!pendingRequests.length}
        >
          {pendingRequests.map((req) => (
            <TableRow key={req._id}>
              <TableCell className="text-foreground">
                {req.staffId?.firstName} {req.staffId?.lastName}
              </TableCell>
              <TableCell className="text-muted-foreground">{req.leaveTypeId?.name}</TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(req.fromDate, 'en-IN', { day: '2-digit', month: 'short' })} –{' '}
                {formatDate(req.toDate, 'en-IN', { day: '2-digit', month: 'short' })}
              </TableCell>
              <TableCell className="text-muted-foreground">{req.totalDays}</TableCell>
            </TableRow>
          ))}
        </DataTable>
      </div>

      <Link to="/staff/leaves" className="text-sm text-primary hover:underline w-fit">
        {t('dashboard.staffSummary.viewLeaveRequests')} ›
      </Link>
    </div>
  );
}
