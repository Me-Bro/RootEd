import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { useAuth } from '../../contexts/useAuth.js';
import { useClassSections } from '../../hooks/useClassSections.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card, CardContent } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { SelectField, SelectItem } from '../../components/ui/SelectField.jsx';
import { cn } from '../../lib/utils.js';
import { formatShiftHours, learnersWithoutSeat } from '../../utils/studyCenter.js';

const errorOf = (err, fallback) => err.response?.data?.error || fallback;

// One shift's seats at a glance: who holds each, which are free, and how many are
// open to day passes. Pick a learner, then a free seat, to seat them; use Move and
// End on a held seat. Staff with students:write can change it, others only look.
export default function SeatMapPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canWrite = (user?.permissions ?? []).includes('students:write');
  const { sections } = useClassSections();

  const [shiftId, setShiftId] = useState('');
  const [learnerId, setLearnerId] = useState('');
  const [moving, setMoving] = useState(null);
  const [error, setError] = useState('');

  // The first shift until the user picks another.
  const sectionId = shiftId || sections[0]?._id || '';

  const availability = useQuery({
    queryKey: ['seat-availability', sectionId],
    queryFn: () =>
      api.get('/academic/seats/availability', { params: { sectionId } }).then((r) => r.data),
    enabled: Boolean(sectionId),
  });
  const roster = useQuery({
    queryKey: ['seat-roster', sectionId],
    queryFn: () =>
      api
        .get('/academic/students', { params: { sectionId, limit: 100, status: 'active' } })
        .then((r) => r.data.students),
    enabled: Boolean(sectionId) && canWrite,
  });

  const items = availability.data?.items ?? [];
  const candidates = learnersWithoutSeat(
    roster.data ?? [],
    items.filter((i) => i.heldBy).map((i) => i.heldBy.studentId)
  );

  const refresh = () => {
    setError('');
    setLearnerId('');
    setMoving(null);
    queryClient.invalidateQueries({ queryKey: ['seat-availability'] });
    queryClient.invalidateQueries({ queryKey: ['seat-allocations'] });
  };
  const failed = (err) => {
    setError(errorOf(err, t('studyCenter.seatMap.failed')));
    // A lost race changes who holds what: show the truth, not the stale map.
    queryClient.invalidateQueries({ queryKey: ['seat-availability'] });
  };

  const assign = useMutation({
    mutationFn: (seatId) =>
      api.post('/academic/seat-allocations', { studentId: learnerId, sectionId, seatId }),
    onSuccess: refresh,
    onError: failed,
  });
  const patch = useMutation({
    mutationFn: ({ id, body }) => api.patch(`/academic/seat-allocations/${id}`, body),
    onSuccess: refresh,
    onError: failed,
  });

  const shiftLabel = (s) => {
    const hours = formatShiftHours(s.startTime, s.endTime);
    return hours ? `${s.name} (${hours})` : s.name;
  };

  function onFreeSeat(seat) {
    if (!canWrite) return;
    if (moving) patch.mutate({ id: moving, body: { action: 'move', seatId: seat.seatId } });
    else if (learnerId) assign.mutate(seat.seatId);
  }

  const hint = moving
    ? t('studyCenter.seatMap.movingHint')
    : learnerId
      ? t('studyCenter.seatMap.assignHint')
      : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('studyCenter.seatMap.title')}
        description={t('studyCenter.seatMap.description')}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SelectField
          label={t('studyCenter.seatMap.shift')}
          value={sectionId}
          onValueChange={(v) => {
            setShiftId(v);
            setLearnerId('');
            setMoving(null);
          }}
        >
          {sections.map((s) => (
            <SelectItem key={s._id} value={s._id}>
              {shiftLabel(s)}
            </SelectItem>
          ))}
        </SelectField>
        {canWrite && (
          <SelectField
            label={t('studyCenter.seatMap.learner')}
            placeholder={t('studyCenter.seatMap.chooseLearner')}
            value={learnerId}
            onValueChange={(v) => {
              setLearnerId(v);
              setMoving(null);
            }}
          >
            {candidates.map((s) => (
              <SelectItem key={s._id} value={s._id}>
                {`${s.firstName} ${s.lastName}`}
              </SelectItem>
            ))}
          </SelectField>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {hint && (
        <p role="status" className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}

      {availability.data && (
        <p className="text-sm text-muted-foreground" data-testid="pool-size">
          {t('studyCenter.seatMap.pool', { count: availability.data.poolSize })}
        </p>
      )}

      {!availability.isLoading && items.length === 0 && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{t('studyCenter.seatMap.empty')}</p>
          </CardContent>
        </Card>
      )}

      <ul
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        aria-label={t('studyCenter.seatMap.title')}
      >
        {items.map((seat) => {
          const held = seat.heldBy;
          return (
            <li
              key={seat.seatId}
              data-testid={`seat-${seat.label}`}
              className={cn(
                'flex flex-col gap-2 rounded-lg border p-3 text-sm',
                held ? 'border-border bg-muted/40' : 'border-dashed border-border'
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{seat.label}</span>
                {seat.zone && <span className="text-xs text-muted-foreground">{seat.zone}</span>}
              </div>
              {held ? (
                <>
                  <p className="truncate text-xs">
                    {t('studyCenter.seatMap.heldBy', { name: held.name })}
                  </p>
                  {canWrite && (
                    <div className="flex gap-2">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => {
                          setLearnerId('');
                          setMoving(moving === held.allocationId ? null : held.allocationId);
                        }}
                      >
                        {t('studyCenter.seatMap.move')}
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={patch.isPending}
                        onClick={() =>
                          patch.mutate({ id: held.allocationId, body: { action: 'end' } })
                        }
                      >
                        {t('studyCenter.seatMap.end')}
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">{t('studyCenter.seatMap.free')}</p>
                  {canWrite && (moving || learnerId) && (
                    <Button
                      size="xs"
                      disabled={assign.isPending || patch.isPending}
                      onClick={() => onFreeSeat(seat)}
                    >
                      {moving ? t('studyCenter.seatMap.moveHere') : t('studyCenter.seatMap.assign')}
                    </Button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
