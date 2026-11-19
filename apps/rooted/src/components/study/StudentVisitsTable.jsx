import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';
import { DataTable, TableRow, TableCell } from '../ui/DataTable.jsx';
import { formatDate, formatTime } from '../../utils/intl.js';
import { formatDuration } from '../../utils/duration.js';
import { ENTITLEMENT_VARIANT } from '../../utils/feePlan.js';
import StudentCheckInControls from './StudentCheckInControls.jsx';

const PAGE_SIZE = 10;

/**
 * A study-center learner's visits: whether they are inside now, this month's totals,
 * and a page of past visits with the seat, how long, and any flags the desk raised.
 * Someone who may mark attendance (`canMark`) can also check the learner in or out.
 */
export default function StudentVisitsTable({ studentId, canMark = false, active = true }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['student-visits', studentId, page],
    queryFn: () =>
      api
        .get(`/academic/students/${studentId}/visits`, { params: { page, limit: PAGE_SIZE } })
        .then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  const visits = data?.visits ?? [];
  const summary = data?.summary;
  const prefix = 'studyCenter.studentVisits';

  return (
    <div className="flex flex-col gap-3">
      {data?.open && (
        <p className="text-sm">
          <Badge variant="success">{t(`${prefix}.insideNow`)}</Badge>{' '}
          <span className="text-muted-foreground">
            {t(`${prefix}.insideSince`, {
              time: formatTime(data.open.inAt),
              seat: data.open.seat.label ?? '—',
            })}
          </span>
        </p>
      )}

      {canMark && data && (
        <StudentCheckInControls studentId={studentId} open={data.open} active={active} />
      )}

      {summary && (
        <p className="text-sm text-muted-foreground">
          {t(`${prefix}.monthSummary`, {
            count: summary.visits,
            time: formatDuration(summary.minutes),
          })}
        </p>
      )}

      <DataTable
        headers={[
          t(`${prefix}.date`),
          t(`${prefix}.in`),
          t(`${prefix}.out`),
          t(`${prefix}.duration`),
          t(`${prefix}.seat`),
          t(`${prefix}.plan`),
          t(`${prefix}.notes`),
          t(`${prefix}.recordedBy`),
        ]}
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        isEmpty={visits.length === 0}
        emptyMessage={t(`${prefix}.none`)}
      >
        {visits.map((v) => (
          <TableRow key={v._id}>
            <TableCell className="px-4 py-2">{formatDate(v.inAt)}</TableCell>
            <TableCell className="px-4 py-2">{formatTime(v.inAt)}</TableCell>
            <TableCell className="px-4 py-2">
              {v.outAt ? formatTime(v.outAt) : t(`${prefix}.stillInside`)}
            </TableCell>
            <TableCell className="px-4 py-2">{formatDuration(v.minutes)}</TableCell>
            <TableCell className="px-4 py-2">{v.seat.label ?? '—'}</TableCell>
            <TableCell className="px-4 py-2">
              {v.entitlementAtCheckIn ? (
                <Badge variant={ENTITLEMENT_VARIANT[v.entitlementAtCheckIn] ?? 'default'}>
                  {t(`${prefix}.entitlement.${v.entitlementAtCheckIn}`)}
                </Badge>
              ) : (
                '—'
              )}
            </TableCell>
            <TableCell className="px-4 py-2">
              <span className="flex flex-wrap gap-1">
                {v.autoClosed && <Badge variant="warning">{t(`${prefix}.autoClosed`)}</Badge>}
                {v.outsideHours && <Badge variant="warning">{t(`${prefix}.outsideHours`)}</Badge>}
              </span>
            </TableCell>
            <TableCell className="px-4 py-2 text-muted-foreground">
              {v.recordedBy.name ?? '—'}
            </TableCell>
          </TableRow>
        ))}
      </DataTable>

      {data && data.pages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            {t(`${prefix}.previous`)}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t(`${prefix}.pageOfTotal`, { page, total: data.pages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= data.pages}
          >
            {t(`${prefix}.next`)}
          </Button>
        </div>
      )}
    </div>
  );
}
