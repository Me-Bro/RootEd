import { useTranslation } from 'react-i18next';
import { Badge } from '../ui/Badge.jsx';
import { DataTable, TableRow, TableCell } from '../ui/DataTable.jsx';
import { formatTime } from '../../utils/intl.js';
import { formatDuration } from '../../utils/duration.js';

/** Today's check-ins and check-outs, newest first. */
export default function DeskActivity({ rows, isLoading }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2" data-testid="desk-activity">
      <h2 className="text-sm font-semibold">{t('studyCenter.desk.activityTitle')}</h2>
      <DataTable
        headers={[
          t('studyCenter.desk.person'),
          t('studyCenter.desk.seat'),
          t('studyCenter.desk.in'),
          t('studyCenter.desk.out'),
          t('studyCenter.desk.length'),
        ]}
        isLoading={isLoading}
        isEmpty={!isLoading && rows.length === 0}
        emptyMessage={t('studyCenter.desk.noActivity')}
      >
        {rows.map((r) => (
          <TableRow key={r.visitId}>
            <TableCell className="font-medium">
              {r.name ?? '—'}
              {r.bulkClosed && (
                <Badge variant="secondary" className="ml-2">
                  {t('studyCenter.desk.closedByOwner')}
                </Badge>
              )}
              {r.autoClosed && (
                <Badge variant="warning" className="ml-2">
                  {t('studyCenter.desk.autoClosed')}
                </Badge>
              )}
            </TableCell>
            <TableCell>{r.seatLabel ?? '—'}</TableCell>
            <TableCell>{formatTime(r.inAt)}</TableCell>
            <TableCell>
              {r.outAt ? formatTime(r.outAt) : t('studyCenter.desk.stillInside')}
            </TableCell>
            <TableCell>{formatDuration(r.minutes)}</TableCell>
          </TableRow>
        ))}
      </DataTable>
    </div>
  );
}
