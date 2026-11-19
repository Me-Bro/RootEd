import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { useAuth } from '../../contexts/useAuth.js';
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { formatCurrency } from '../../utils/intl.js';
import { apiError, localDayString } from '../../utils/studyCenter.js';
import {
  cyclePrice,
  earliestStartDay,
  planActions,
  splitFeeStructures,
} from '../../utils/feePlan.js';
import FeePlanLedger from './FeePlanLedger.jsx';
import FeePlanPauseControls from './FeePlanPauseControls.jsx';

const selectCls =
  'h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

const STATE_VARIANT = {
  active: 'success',
  paused: 'warning',
  scheduled: 'secondary',
  ended: 'danger',
};

// Study centers: a learner's fee plan (a monthly or weekly structure from a start date,
// with its ledger and pause/resume) and any one-off fees alongside it. Desk-sold plans
// are not listed here.
export default function StudentFeeStructurePanel({ studentId, canWrite }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const locale = i18n.language?.startsWith('hi') ? 'hi-IN' : 'en-IN';
  const isOwner = (user?.permissions ?? []).includes('tenant:admin');

  const [choice, setChoice] = useState('');
  const [startDay, setStartDay] = useState(localDayString());
  const [changing, setChanging] = useState(false);
  const [oneOffChoice, setOneOffChoice] = useState('');
  const [error, setError] = useState('');

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['student-billing', studentId] });
    queryClient.invalidateQueries({ queryKey: ['student-fee-assignments', studentId] });
  };

  const { data: billing } = useQuery({
    queryKey: ['student-billing', studentId],
    queryFn: () => api.get(`/fee/students/${studentId}/billing`).then((r) => r.data),
  });
  const { data: assignments = [] } = useQuery({
    queryKey: ['student-fee-assignments', studentId],
    queryFn: () => api.get(`/fee/assignments?studentId=${studentId}`).then((r) => r.data),
  });
  const { data: structures = [] } = useQuery({
    queryKey: ['fee-structures'],
    enabled: canWrite,
    queryFn: () => api.get('/fee/structures').then((r) => r.data),
  });

  const plan = billing?.plan ?? null;
  const { cyclePlans, oneOffs } = splitFeeStructures(structures);
  const myOneOffs = assignments.filter((a) => !a.billing && !a.coversFrom);
  const heldIds = new Set(myOneOffs.map((a) => String(a.feeStructureId?._id ?? a.feeStructureId)));
  const addableOneOffs = oneOffs.filter((s) => !heldIds.has(String(s._id)));

  const priceOf = (s) =>
    t(
      s.cycle === 'weekly'
        ? 'studyCenter.plan.billing.priceWeek'
        : 'studyCenter.plan.billing.priceMonth',
      {
        amount: formatCurrency(cyclePrice(s)),
      }
    );

  const setStructure = useMutation({
    mutationFn: ({ feeStructureId, startDate }) =>
      api
        .put(`/fee/students/${studentId}/structure`, { feeStructureId, startDate })
        .then((r) => r.data),
    onSuccess: () => {
      refresh();
      setChoice('');
      setOneOffChoice('');
      setChanging(false);
      setError('');
    },
    onError: (err) => setError(apiError(err, t('studyCenter.plan.billing.failed'))),
  });

  const removeOneOff = useMutation({
    mutationFn: (assignmentId) =>
      api.delete(`/fee/students/${studentId}/assignments/${assignmentId}`),
    onSuccess: () => {
      refresh();
      setError('');
    },
    onError: (err) => setError(apiError(err, t('studyCenter.plan.billing.removeFailed'))),
  });

  const { canPause, canResume } = planActions(plan);
  const choosing = canWrite && (!plan || changing) && plan?.state !== 'ended';
  const chosenStructure = cyclePlans.find((s) => s._id === choice);

  return (
    <div className="flex flex-col gap-4 text-sm">
      <section className="flex flex-col gap-3" aria-label={t('studyCenter.plan.cycleLabel')}>
        {plan ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{plan.name}</span>
              <Badge variant={STATE_VARIANT[plan.state] ?? 'secondary'} data-testid="plan-state">
                {t(`studyCenter.plan.billing.state_${plan.state}`)}
              </Badge>
              <span className="text-muted-foreground">
                {plan.cycle === 'weekly'
                  ? t('studyCenter.plan.weekly')
                  : t('studyCenter.plan.monthly')}
                {' · '}
                {formatCurrency(plan.segments[plan.segments.length - 1].amount)}
              </span>
            </div>
            <FeePlanLedger plan={plan} locale={locale} />
          </>
        ) : (
          <p className="text-muted-foreground">{t('studyCenter.plan.billing.noPlan')}</p>
        )}

        {choosing &&
          (cyclePlans.length === 0 ? (
            <p className="text-muted-foreground">{t('studyCenter.plan.billing.noPlans')}</p>
          ) : (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <select
                aria-label={t('studyCenter.plan.billing.choosePlan')}
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
                className={selectCls}
              >
                <option value="">{t('studyCenter.plan.billing.choosePlan')}</option>
                {cyclePlans.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name} · {priceOf(s)}
                  </option>
                ))}
              </select>
              <Input
                type="date"
                label={
                  plan
                    ? t('studyCenter.plan.billing.changeFrom')
                    : t('studyCenter.plan.billing.startDate')
                }
                value={startDay}
                min={earliestStartDay()}
                onChange={(e) => setStartDay(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {plan
                  ? t('studyCenter.plan.billing.changeHint')
                  : t('studyCenter.plan.billing.startHint')}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!choice || !startDay || setStructure.isPending}
                  onClick={() =>
                    setStructure.mutate({ feeStructureId: choice, startDate: startDay })
                  }
                >
                  {plan
                    ? t('studyCenter.plan.billing.changePlan')
                    : t('studyCenter.plan.billing.startPlan')}
                </Button>
                {changing && (
                  <Button size="sm" variant="outline" onClick={() => setChanging(false)}>
                    {t('common.cancel')}
                  </Button>
                )}
              </div>
              {chosenStructure && (
                <p className="text-xs text-muted-foreground">{priceOf(chosenStructure)}</p>
              )}
            </div>
          ))}

        {canWrite && plan && !changing && plan.state !== 'ended' && (
          <Button
            size="sm"
            variant="outline"
            className="w-fit"
            onClick={() => {
              setStartDay(localDayString());
              setChanging(true);
            }}
          >
            {t('studyCenter.plan.billing.changePlan')}
          </Button>
        )}

        {isOwner && plan && (
          <FeePlanPauseControls
            studentId={studentId}
            plan={plan}
            canPause={canPause}
            canResume={canResume}
            onChanged={refresh}
          />
        )}
      </section>

      <section
        className="flex flex-col gap-2"
        aria-label={t('studyCenter.plan.billing.oneOffHeading')}
      >
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">
          {t('studyCenter.plan.billing.oneOffHeading')}
        </h3>
        {myOneOffs.length === 0 && (
          <p className="text-muted-foreground">{t('studyCenter.plan.billing.oneOffEmpty')}</p>
        )}
        <ul className="flex flex-col gap-1">
          {myOneOffs.map((a) => (
            <li key={a._id} className="flex items-center justify-between gap-2">
              <span>
                {a.feeStructureId?.name}
                <span className="text-muted-foreground">
                  {' · '}
                  {formatCurrency(a.totalAmount)}
                  {a.paidAmount > 0 &&
                    ` (${t('studyCenter.plan.billing.paid')} ${formatCurrency(a.paidAmount)})`}
                </span>
              </span>
              {canWrite && a.paidAmount === 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={removeOneOff.isPending}
                  onClick={() => removeOneOff.mutate(a._id)}
                >
                  {t('studyCenter.plan.billing.removeOneOff')}
                </Button>
              )}
            </li>
          ))}
        </ul>
        {canWrite && addableOneOffs.length > 0 && (
          <div className="flex gap-2">
            <select
              aria-label={t('studyCenter.plan.billing.chooseOneOff')}
              value={oneOffChoice}
              onChange={(e) => setOneOffChoice(e.target.value)}
              className={selectCls}
            >
              <option value="">{t('studyCenter.plan.billing.chooseOneOff')}</option>
              {addableOneOffs.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name} · {formatCurrency(cyclePrice(s))}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={!oneOffChoice || setStructure.isPending}
              onClick={() => setStructure.mutate({ feeStructureId: oneOffChoice })}
            >
              {t('studyCenter.plan.billing.addOneOff')}
            </Button>
          </div>
        )}
      </section>

      {error && (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
