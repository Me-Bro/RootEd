import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { Button } from '../ui/Button.jsx';
import { formatTime } from '../../utils/intl.js';
import { apiError } from '../../utils/studyCenter.js';

const selectCls =
  'h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';
const prefix = 'studyCenter.desk';

/**
 * Check a learner in or out from their own page, the same calls the front desk makes.
 * A plan that is unpaid, expired or missing warns and never blocks; after closing time
 * only an owner can check anyone in (the server says so, and its message is shown).
 */
export default function StudentCheckInControls({ studentId, open, active = true }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [seatId, setSeatId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);

  const { data: seats = [], isLoading } = useQuery({
    queryKey: ['free-seats', studentId],
    queryFn: () =>
      api.get('/academic/visits/free-seats', { params: { studentId } }).then((r) => r.data),
    enabled: !open && active,
  });
  const chosen = seatId || seats[0]?.seatId || '';

  // A visit changes the visits list, today's attendance, the history and who is inside.
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['student-visits', studentId] });
    queryClient.invalidateQueries({ queryKey: ['student-attendance', studentId] });
    queryClient.invalidateQueries({ queryKey: ['student-history', studentId] });
    queryClient.invalidateQueries({ queryKey: ['open-visits'] });
    queryClient.invalidateQueries({ queryKey: ['free-seats'] });
  };

  const checkIn = useMutation({
    mutationFn: () =>
      api
        .post('/academic/visits/check-in', { studentId, ...(seatId ? { seatId } : {}) })
        .then((r) => r.data),
    onSuccess: (data) => {
      setError('');
      setSeatId('');
      setNotice({
        seat: data.seat.label,
        warning: data.warning,
        outsideHours: data.visit.outsideHours,
      });
      refresh();
    },
    onError: (err) => {
      setNotice(null);
      setError(apiError(err, t(`${prefix}.failed`)));
      refresh();
    },
  });

  const checkOut = useMutation({
    mutationFn: () => api.post(`/academic/visits/${open._id}/check-out`),
    onSuccess: () => {
      setError('');
      setNotice(null);
      refresh();
    },
    onError: (err) => {
      setError(apiError(err, t(`${prefix}.failed`)));
      refresh();
    },
  });

  const warn = notice?.warning?.status && notice.warning.status !== 'valid';

  return (
    <div className="flex flex-col gap-2">
      {open ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">
            {t(`${prefix}.alreadyIn`, {
              seat: open.seat.label ?? '—',
              time: formatTime(open.inAt),
            })}
          </p>
          <Button size="sm" disabled={checkOut.isPending} onClick={() => checkOut.mutate()}>
            {t(`${prefix}.checkOut`)}
          </Button>
        </div>
      ) : active ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-44 flex-1">
            <select
              aria-label={t(`${prefix}.seat`)}
              value={chosen}
              onChange={(e) => setSeatId(e.target.value)}
              disabled={isLoading || seats.length === 0}
              className={selectCls}
            >
              {seats.length === 0 && <option value="">{t(`${prefix}.noFreeSeat`)}</option>}
              {seats.map((s) => (
                <option key={s.seatId} value={s.seatId}>
                  {s.own ? t(`${prefix}.ownSeat`, { label: s.label }) : s.label}
                </option>
              ))}
            </select>
          </div>
          <Button
            size="sm"
            disabled={!chosen || checkIn.isPending}
            onClick={() => checkIn.mutate()}
          >
            {t(`${prefix}.checkIn`)}
          </Button>
        </div>
      ) : null}

      {notice && (
        <div className="flex flex-col gap-0.5 text-sm" data-testid="checkin-done">
          <p className="font-medium">
            {t('studyCenter.studentVisits.checkedInOn', { seat: notice.seat })}
          </p>
          {notice.outsideHours && (
            <p className="text-muted-foreground">{t(`${prefix}.outsideHoursNote`)}</p>
          )}
          {warn && (
            <p role="status" className="font-medium text-yellow-700">
              {t(`${prefix}.warn_${notice.warning.status}`)}
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
