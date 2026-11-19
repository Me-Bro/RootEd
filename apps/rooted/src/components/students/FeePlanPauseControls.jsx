import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { useClassSections } from '../../hooks/useClassSections.js';
import { apiError, localDayString } from '../../utils/studyCenter.js';

const selectCls =
  'h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * Owner only: pause a learner's billing (their seats are released) and resume it,
 * optionally giving them a seat again. `onChanged` runs after either succeeds.
 */
export default function FeePlanPauseControls({ studentId, plan, canPause, canResume, onChanged }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(localDayString());
  const [sectionId, setSectionId] = useState('');
  const [seatId, setSeatId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { sections } = useClassSections();

  const { data: availability } = useQuery({
    queryKey: ['seat-availability', sectionId],
    enabled: canResume && open && Boolean(sectionId),
    queryFn: () =>
      api.get('/academic/seats/availability', { params: { sectionId } }).then((r) => r.data),
  });
  const freeSeats = (availability?.items ?? []).filter((i) => !i.heldBy);

  const done = (text) => {
    setOpen(false);
    setSectionId('');
    setSeatId('');
    setError('');
    setMessage(text);
    onChanged();
  };

  const pause = useMutation({
    mutationFn: () => api.post(`/fee/students/${studentId}/pause`, { on: day }).then((r) => r.data),
    onSuccess: (data) =>
      done(t('studyCenter.plan.billing.paused', { count: data.seatsReleased ?? 0 })),
    onError: (err) => setError(apiError(err, t('studyCenter.plan.billing.actionFailed'))),
  });

  const resume = useMutation({
    mutationFn: () =>
      api
        .post(`/fee/students/${studentId}/resume`, {
          on: day,
          ...(seatId && sectionId ? { seatId, sectionId } : {}),
        })
        .then((r) => r.data),
    onSuccess: (data) =>
      done(
        data.seatError
          ? t('studyCenter.plan.billing.seatWarning', { reason: data.seatError })
          : t('studyCenter.plan.billing.resumed')
      ),
    onError: (err) => setError(apiError(err, t('studyCenter.plan.billing.actionFailed'))),
  });

  if (!canPause && !canResume && !message) return null;

  const isResume = canResume;
  const action = isResume ? resume : pause;
  const pausedSince = plan.pauses.find((p) => !p.to)?.from;

  return (
    <div className="flex flex-col gap-2">
      {message && (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}
      {(canPause || canResume) && !open && (
        <Button
          size="sm"
          variant="outline"
          className="w-fit"
          onClick={() => {
            setMessage('');
            setDay(localDayString());
            setOpen(true);
          }}
        >
          {isResume ? t('studyCenter.plan.billing.resume') : t('studyCenter.plan.billing.pause')}
        </Button>
      )}
      {open && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <Input
            type="date"
            label={
              isResume
                ? t('studyCenter.plan.billing.resumeFrom')
                : t('studyCenter.plan.billing.pauseFrom')
            }
            value={day}
            min={isResume ? pausedSince : plan.segments[0]?.from}
            max={localDayString()}
            onChange={(e) => setDay(e.target.value)}
          />
          {!isResume && (
            <p className="text-xs text-muted-foreground">
              {t('studyCenter.plan.billing.pauseHint')}
            </p>
          )}
          {isResume && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="resume-shift" className="text-sm font-medium">
                  {t('studyCenter.plan.billing.resumeSeat')}
                </label>
                <select
                  id="resume-shift"
                  value={sectionId}
                  onChange={(e) => {
                    setSectionId(e.target.value);
                    setSeatId('');
                  }}
                  className={selectCls}
                  aria-label={t('studyCenter.plan.billing.resumeShift')}
                >
                  <option value="">{t('studyCenter.plan.billing.resumeNoSeat')}</option>
                  {sections.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              {sectionId && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">{t('studyCenter.desk.seat')}</span>
                  <select
                    value={seatId}
                    onChange={(e) => setSeatId(e.target.value)}
                    className={selectCls}
                    aria-label={t('studyCenter.desk.seat')}
                  >
                    <option value="">{t('studyCenter.plan.billing.resumeNoSeat')}</option>
                    {freeSeats.map((s) => (
                      <option key={s.seatId} value={s.seatId}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" disabled={!day || action.isPending} onClick={() => action.mutate()}>
              {isResume
                ? t('studyCenter.plan.billing.resumeConfirm')
                : t('studyCenter.plan.billing.pauseConfirm')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
