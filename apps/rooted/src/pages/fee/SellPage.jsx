import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { useAuth } from '../../contexts/useAuth.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card, CardContent } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { SelectField, SelectItem } from '../../components/ui/SelectField.jsx';
import LearnerPicker from '../../components/study/LearnerPicker.jsx';
import {
  apiError,
  canApplyDiscount,
  pickableDiscounts,
  sellablePlans,
} from '../../utils/studyCenter.js';
import { formatCurrency, formatDate } from '../../utils/intl.js';

const METHODS = ['cash', 'upi', 'card', 'bank_transfer', 'cheque'];

// The front-desk sale: pick (or register) a learner, pick a plan or a day pass, take
// the payment. A discount is offered only when the centre's policy lets this person
// give one; the learner's own standing discount is applied by the server on its own.
export default function SellPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const permissions = user?.permissions ?? [];

  // The desk hands over a learner (Sell a plan) or a learner, plan and start date
  // (Renew on the expiring list). `renewFrom` is set only for a plan still running.
  const handoff = useLocation().state;
  const [learner, setLearner] = useState(handoff?.learner ?? null);
  const [planId, setPlanId] = useState(handoff?.feeStructureId ?? '');
  const [renewFrom, setRenewFrom] = useState(handoff?.renewFrom ?? null);
  const [discountId, setDiscountId] = useState('');
  const [method, setMethod] = useState('cash');
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [undoing, setUndoing] = useState(false);
  const [undoReason, setUndoReason] = useState('');
  const [undone, setUndone] = useState(false);
  const canCheckIn = permissions.includes('attendance:write');

  const settings = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => api.get('/tenant/settings').then((r) => r.data),
  });
  const structures = useQuery({
    queryKey: ['fee-structures', 'sellable'],
    queryFn: () => api.get('/fee/structures').then((r) => r.data),
  });
  const mayDiscount = canApplyDiscount(settings.data?.centre?.discountPolicy, permissions);
  const discounts = useQuery({
    queryKey: ['fee-discounts'],
    queryFn: () => api.get('/fee/discounts').then((r) => r.data),
    enabled: mayDiscount,
  });
  const entitlement = useQuery({
    queryKey: ['entitlement', learner?._id],
    queryFn: () =>
      api.get('/fee/entitlement', { params: { studentId: learner._id } }).then((r) => r.data),
    enabled: Boolean(learner),
  });

  const plans = sellablePlans(structures.data ?? []);
  const plan = plans.find((p) => p._id === planId);
  const price = (plan?.components ?? []).reduce(
    (sum, c) => (c.isOptional ? sum : sum + c.amount),
    0
  );

  const sell = useMutation({
    mutationFn: () =>
      api
        .post('/fee/sales', {
          studentId: learner._id,
          feeStructureId: planId,
          paymentMethod: method,
          ...(discountId ? { discountId } : {}),
          ...(renewFrom ? { startDate: renewFrom } : {}),
        })
        .then((r) => r.data),
    onSuccess: (data) => {
      setError('');
      setDone({ ...data, learner, plan });
      setUndone(false);
      setUndoing(false);
      setLearner(null);
      setPlanId('');
      setRenewFrom(null);
      setDiscountId('');
      queryClient.invalidateQueries({ queryKey: ['entitlement'] });
      queryClient.invalidateQueries({ queryKey: ['expiring-plans'] });
      queryClient.invalidateQueries({ queryKey: ['fee-assignments'] });
    },
    onError: (err) => setError(apiError(err, t('studyCenter.sell.failed'))),
  });

  // Undo the sale just made (wrong learner or plan). The server refunds the payment and
  // removes the plan; the desk may undo only its own sale from today.
  const undo = useMutation({
    mutationFn: () =>
      api
        .post(`/fee/sales/${done.assignment._id}/void`, { reason: undoReason.trim() })
        .then((r) => r.data),
    onSuccess: () => {
      setError('');
      setDone(null);
      setUndone(true);
      setUndoing(false);
      setUndoReason('');
      queryClient.invalidateQueries({ queryKey: ['entitlement'] });
      queryClient.invalidateQueries({ queryKey: ['expiring-plans'] });
      queryClient.invalidateQueries({ queryKey: ['fee-assignments'] });
    },
    onError: (err) => setError(apiError(err, t('studyCenter.sell.undoFailed'))),
  });

  const status = entitlement.data?.status;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('studyCenter.sell.title')}
        description={t('studyCenter.sell.description')}
      />

      {done && (
        <Card data-testid="sale-done">
          <CardContent className="flex flex-col gap-1 pt-4 text-sm">
            <p className="font-medium">
              {t('studyCenter.sell.sold', { plan: done.plan?.name, name: done.learner.firstName })}
            </p>
            <p>
              {done.payment
                ? t('studyCenter.sell.paid', { amount: formatCurrency(done.payment.amount) })
                : t('studyCenter.sell.freeSale')}
            </p>
            {done.discountAmount > 0 && (
              <p className="text-muted-foreground">
                {t('studyCenter.sell.discounted', { amount: formatCurrency(done.discountAmount) })}
              </p>
            )}
            {done.assignment?.coversTo && (
              <p className="text-muted-foreground">
                {t('studyCenter.sell.validUntil', { date: formatDate(done.assignment.coversTo) })}
              </p>
            )}
            {canCheckIn && (
              <Link
                to="/desk"
                state={{ learner: done.learner }}
                className="text-primary hover:underline"
              >
                {t('studyCenter.sell.checkInNow')}
              </Link>
            )}
            {done.receiptUrl ? (
              <a
                href={done.receiptUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                {t('studyCenter.sell.receipt')}
              </a>
            ) : (
              done.payment && (
                <p className="text-muted-foreground">{t('studyCenter.sell.noReceipt')}</p>
              )
            )}
            {undoing ? (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <Input
                  label={t('studyCenter.sell.undoReason')}
                  value={undoReason}
                  maxLength={200}
                  onChange={(e) => setUndoReason(e.target.value)}
                />
                <Button
                  variant="destructive"
                  disabled={!undoReason.trim() || undo.isPending}
                  onClick={() => undo.mutate()}
                >
                  {undo.isPending ? t('common.saving') : t('studyCenter.sell.undoConfirm')}
                </Button>
                <Button variant="outline" type="button" onClick={() => setUndoing(false)}>
                  {t('studyCenter.sell.undoCancel')}
                </Button>
              </div>
            ) : (
              <button
                type="button"
                className="self-start text-destructive hover:underline"
                onClick={() => setUndoing(true)}
              >
                {t('studyCenter.sell.undo')}
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {undone && (
        <p role="status" className="text-sm font-medium" data-testid="sale-undone">
          {t('studyCenter.sell.undone')}
        </p>
      )}

      <Card>
        <CardContent className="flex flex-col gap-5 pt-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">{t('studyCenter.sell.learner')}</h2>
            <LearnerPicker
              value={learner}
              onChange={(l) => {
                setLearner(l);
                setRenewFrom(null); // the start date belonged to the previous learner
                setDone(null);
                setUndone(false);
              }}
              allowWalkIn
            />
            {learner && status && (
              <p className="text-xs text-muted-foreground" data-testid="entitlement">
                {t(`studyCenter.sell.entitlement_${status}`, {
                  date: entitlement.data?.coversTo ? formatDate(entitlement.data.coversTo) : '',
                })}
              </p>
            )}
          </div>

          <SelectField
            label={t('studyCenter.sell.plan')}
            placeholder={t('studyCenter.sell.choosePlan')}
            value={planId}
            onValueChange={setPlanId}
          >
            {plans.map((p) => (
              <SelectItem key={p._id} value={p._id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectField>

          {mayDiscount && (
            <SelectField
              label={t('studyCenter.sell.discount')}
              placeholder={t('studyCenter.sell.noDiscount')}
              value={discountId}
              onValueChange={(v) => setDiscountId(v === 'none' ? '' : v)}
            >
              <SelectItem value="none">{t('studyCenter.sell.noDiscount')}</SelectItem>
              {pickableDiscounts(discounts.data ?? []).map((d) => (
                <SelectItem key={d._id} value={d._id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectField>
          )}

          <SelectField
            label={t('studyCenter.sell.method')}
            value={method}
            onValueChange={setMethod}
          >
            {METHODS.map((m) => (
              <SelectItem key={m} value={m}>
                {t(`studyCenter.sell.method_${m}`)}
              </SelectItem>
            ))}
          </SelectField>

          {renewFrom && (
            <p className="text-sm text-muted-foreground" data-testid="sale-starts-on">
              {t('studyCenter.sell.startsOn', { date: formatDate(renewFrom) })}
            </p>
          )}

          {plan && (
            <p className="text-sm" data-testid="sale-price">
              {t('studyCenter.sell.price', { amount: formatCurrency(price) })}
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div>
            <Button disabled={!learner || !planId || sell.isPending} onClick={() => sell.mutate()}>
              {sell.isPending ? t('common.saving') : t('studyCenter.sell.sell')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
