import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../../utils/intl.js';
import { cycleStartText, dayText } from '../../utils/feePlan.js';

const STATUS_TONE = {
  paid: 'text-emerald-600',
  partial: 'text-amber-600',
  unpaid: 'text-destructive',
};

/** A learner's fee plan: its balances and one row per cycle, from GET /fee/students/:id/billing. */
export default function FeePlanLedger({ plan, locale }) {
  const { t } = useTranslation();
  const cycleName = (c) =>
    c.cycle === 'weekly'
      ? t('studyCenter.plan.billing.weekOf', { date: cycleStartText('weekly', c.start, locale) })
      : cycleStartText('monthly', c.start, locale);

  return (
    <div className="flex flex-col gap-2" data-testid="fee-plan-ledger">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {plan.overdue > 0 ? (
          <span className="font-medium text-destructive" data-testid="plan-overdue">
            {t('studyCenter.plan.billing.overdue', { amount: formatCurrency(plan.overdue) })}
          </span>
        ) : (
          <span className="text-emerald-600">{t('studyCenter.plan.billing.allClear')}</span>
        )}
        {plan.current > 0 && (
          <span className="text-muted-foreground">
            {t('studyCenter.plan.billing.thisCycle', { amount: formatCurrency(plan.current) })}
          </span>
        )}
        {plan.credit > 0 && (
          <span className="text-muted-foreground">
            {t('studyCenter.plan.billing.credit', { amount: formatCurrency(plan.credit) })}
          </span>
        )}
      </div>

      {plan.cycles.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-2 font-medium">{t('studyCenter.plan.billing.cycle')}</th>
                <th className="py-1 pr-2 text-right font-medium">
                  {t('studyCenter.plan.billing.days')}
                </th>
                <th className="py-1 pr-2 text-right font-medium">
                  {t('studyCenter.plan.billing.charge')}
                </th>
                <th className="py-1 pr-2 text-right font-medium">
                  {t('studyCenter.plan.billing.discount')}
                </th>
                <th className="py-1 pr-2 text-right font-medium">
                  {t('studyCenter.plan.billing.net')}
                </th>
                <th className="py-1 pr-2 text-right font-medium">
                  {t('studyCenter.plan.billing.paid')}
                </th>
                <th className="py-1 pr-2 font-medium">{t('studyCenter.plan.billing.due')}</th>
                <th className="py-1 font-medium" />
              </tr>
            </thead>
            <tbody>
              {plan.cycles.map((c) => (
                <tr key={`${c.cycle}-${c.start}`} className="border-t border-border">
                  <td className="py-1 pr-2">
                    {cycleName(c)}
                    {c.phase === 'current' && (
                      <span className="ml-1 text-muted-foreground">
                        ({t('studyCenter.plan.billing.current')})
                      </span>
                    )}
                  </td>
                  <td className="py-1 pr-2 text-right">
                    {c.activeDays}/{c.daysInCycle}
                  </td>
                  <td className="py-1 pr-2 text-right">{formatCurrency(c.charge)}</td>
                  <td className="py-1 pr-2 text-right">
                    {c.discount ? `−${formatCurrency(c.discount)}` : '—'}
                  </td>
                  <td className="py-1 pr-2 text-right font-medium">{formatCurrency(c.net)}</td>
                  <td className="py-1 pr-2 text-right">{formatCurrency(c.paid)}</td>
                  <td className="py-1 pr-2">{dayText(c.dueOn, locale)}</td>
                  <td className={`py-1 ${STATUS_TONE[c.status] ?? ''}`}>
                    {t(`studyCenter.plan.billing.status_${c.status}`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
