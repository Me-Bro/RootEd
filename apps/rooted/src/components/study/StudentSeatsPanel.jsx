import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { Button } from '../ui/Button.jsx';
import { useClassSections } from '../../hooks/useClassSections.js';
import { apiError } from '../../utils/studyCenter.js';
import { freeSeats, seatOptionLabel, shiftsToOffer } from '../../utils/seatOptions.js';

const selectCls =
  'h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';
const prefix = 'studyCenter.studentSeats';

// The free seats of one shift, as a select. Loads when the shift is known.
function SeatSelect({ sectionId, value, onChange, label }) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['seat-availability', sectionId],
    queryFn: () =>
      api.get('/academic/seats/availability', { params: { sectionId } }).then((r) => r.data),
    enabled: Boolean(sectionId),
  });
  const seats = freeSeats(data?.items);
  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!sectionId || isLoading}
        className={selectCls}
      >
        <option value="">{label}</option>
        {seats.map((s) => (
          <option key={s.seatId} value={s.seatId}>
            {seatOptionLabel(s)}
          </option>
        ))}
      </select>
      {sectionId && !isLoading && seats.length === 0 && (
        <p className="text-xs text-muted-foreground">{t(`${prefix}.noFreeSeat`)}</p>
      )}
    </div>
  );
}

/**
 * A learner's seat in each shift, on their page. Someone who may edit students can give
 * a seat in a shift (enrolling them in it if needed), move one to another free seat in
 * the same shift, or release it. The server enforces every rule; its message is shown
 * when it refuses.
 */
export default function StudentSeatsPanel({ studentId, canWrite = false, active = true }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { sections } = useClassSections();

  const [assigning, setAssigning] = useState(false);
  const [shiftId, setShiftId] = useState('');
  const [seatId, setSeatId] = useState('');
  const [movingId, setMovingId] = useState(null);
  const [moveSeatId, setMoveSeatId] = useState('');
  const [error, setError] = useState('');

  const { data = [], isLoading } = useQuery({
    queryKey: ['seat-allocations', studentId],
    queryFn: () =>
      api.get('/academic/seat-allocations', { params: { studentId } }).then((r) => r.data),
  });

  const done = () => {
    setError('');
    setAssigning(false);
    setShiftId('');
    setSeatId('');
    setMovingId(null);
    setMoveSeatId('');
    queryClient.invalidateQueries({ queryKey: ['seat-allocations', studentId] });
    queryClient.invalidateQueries({ queryKey: ['seat-availability'] });
    queryClient.invalidateQueries({ queryKey: ['student-history', studentId] });
  };
  const failed = (err) => {
    setError(apiError(err, t(`${prefix}.failed`)));
    // A lost race changes who holds what: show the truth.
    queryClient.invalidateQueries({ queryKey: ['seat-availability'] });
  };

  const assign = useMutation({
    mutationFn: async () => {
      // Joining the shift is idempotent, and the server will not seat someone who is not in it.
      await api.post('/academic/enrollments', { studentId, sectionId: shiftId });
      return api.post('/academic/seat-allocations', { studentId, sectionId: shiftId, seatId });
    },
    onSuccess: done,
    onError: failed,
  });
  const patch = useMutation({
    mutationFn: ({ id, body }) => api.patch(`/academic/seat-allocations/${id}`, body),
    onSuccess: done,
    onError: failed,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;

  const offered = shiftsToOffer(sections, data);
  const mayChange = canWrite && active;

  return (
    <div className="flex flex-col gap-3">
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t(`${prefix}.none`)}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.map((a) => (
            <li key={a._id} className="flex flex-col gap-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  {t(`${prefix}.row`, {
                    shift: a.sectionId?.name ?? '—',
                    label: a.seatId?.label ?? '—',
                  })}
                </span>
                {mayChange && (
                  <>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        setError('');
                        setMoveSeatId('');
                        setMovingId(movingId === a._id ? null : a._id);
                      }}
                    >
                      {t(`${prefix}.move`)}
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={patch.isPending}
                      onClick={() => patch.mutate({ id: a._id, body: { action: 'end' } })}
                    >
                      {t(`${prefix}.end`)}
                    </Button>
                  </>
                )}
              </div>
              {movingId === a._id && (
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-40 flex-1">
                    <SeatSelect
                      sectionId={String(a.sectionId?._id ?? a.sectionId)}
                      value={moveSeatId}
                      onChange={setMoveSeatId}
                      label={t(`${prefix}.chooseSeat`)}
                    />
                  </div>
                  <Button
                    size="sm"
                    disabled={!moveSeatId || patch.isPending}
                    onClick={() =>
                      patch.mutate({ id: a._id, body: { action: 'move', seatId: moveSeatId } })
                    }
                  >
                    {t(`${prefix}.moveConfirm`)}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {mayChange && offered.length > 0 && !assigning && (
        <Button
          size="sm"
          variant="outline"
          className="w-fit"
          onClick={() => {
            setError('');
            setAssigning(true);
          }}
        >
          {t(`${prefix}.give`)}
        </Button>
      )}

      {mayChange && assigning && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <select
            aria-label={t(`${prefix}.chooseShift`)}
            value={shiftId}
            onChange={(e) => {
              setShiftId(e.target.value);
              setSeatId('');
            }}
            className={selectCls}
          >
            <option value="">{t(`${prefix}.chooseShift`)}</option>
            {offered.map((s) => (
              <option key={s._id} value={s._id}>
                {s.label}
              </option>
            ))}
          </select>
          <SeatSelect
            sectionId={shiftId}
            value={seatId}
            onChange={setSeatId}
            label={t(`${prefix}.chooseSeat`)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!shiftId || !seatId || assign.isPending}
              onClick={() => assign.mutate()}
            >
              {t(`${prefix}.giveConfirm`)}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAssigning(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      {canWrite && !active && (
        <p className="text-xs text-muted-foreground">{t(`${prefix}.inactiveNote`)}</p>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Link to="/academic/seat-map" className="text-xs text-primary hover:underline">
        {t(`${prefix}.openMap`)}
      </Link>
    </div>
  );
}
