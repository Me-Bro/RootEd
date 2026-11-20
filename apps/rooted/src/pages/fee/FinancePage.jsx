import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import api from '../../lib/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Card, CardContent } from '../../components/ui/Card.jsx';
import { LoadError } from '../../components/ui/LoadError.jsx';
import MonthlyMoneyChart from '../../components/fee/MonthlyMoneyChart.jsx';
import { formatCurrency } from '../../utils/intl.js';
import { localMonthString } from '../../utils/studyCenter.js';

const METHOD_KEYS = {
  cash: 'expense.entries.methodCash',
  upi: 'expense.entries.methodUpi',
  bank_transfer: 'expense.entries.methodBankTransfer',
  card: 'expense.entries.methodCard',
  cheque: 'finance.methodCheque',
};

function Stat({ label, value, hint, tone, testId, to }) {
  const body = (
    <CardContent className="pt-4">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone ?? 'text-foreground'}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </CardContent>
  );
  return (
    <Card data-testid={testId}>
      {to ? (
        <Link to={to} className="block rounded-xl hover:bg-muted/40">
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
  );
}

// A split as rows with a share bar: the figure is always written out, the bar is extra.
function Breakdown({ title, rows, labelOf, total, empty, testId }) {
  return (
    <Card data-testid={testId}>
      <CardContent className="pt-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {rows.map((r) => (
              <li key={labelOf(r)}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span>{labelOf(r)}</span>
                  <span className="font-medium">{formatCurrency(r.total)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-muted">
                  <div
                    className="h-1.5 rounded-full bg-foreground/60"
                    style={{ width: `${total > 0 ? Math.max((r.total / total) * 100, 2) : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// The owner's money for a month: what came in, what went out, what is left, and what
// learners still owe. Everything is worked out on the server on the centre's calendar.
export default function FinancePage() {
  const { t } = useTranslation();
  const [month, setMonth] = useState(localMonthString());

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['finance-overview', month],
    queryFn: () =>
      api.get('/fee/reports/finance-overview', { params: { month } }).then((r) => r.data),
    enabled: Boolean(month),
  });

  const categoryLabel = (r) =>
    t(`expense.centre.categories.${r.category}`, { defaultValue: r.category });
  const methodLabel = (r) => t(METHOD_KEYS[r.method] ?? r.method, { defaultValue: r.method });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('finance.title')} description={t('finance.description')} />

      <div className="max-w-xs">
        <Input
          id="finance-month"
          type="month"
          label={t('finance.month')}
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </div>

      {isError && <LoadError onRetry={refetch} />}
      {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              testId="finance-collected"
              label={t('finance.collected')}
              value={formatCurrency(data.collected)}
            />
            <Stat
              testId="finance-spent"
              label={t('finance.spent')}
              value={formatCurrency(data.spent)}
              hint={
                <Link to="/expense" className="underline-offset-2 hover:underline">
                  {t('finance.seeExpenses')}
                </Link>
              }
            />
            <Stat
              testId="finance-net"
              label={t('finance.net')}
              value={formatCurrency(data.net)}
              tone={data.net < 0 ? 'text-destructive' : undefined}
              hint={data.net < 0 ? t('finance.netNegative') : undefined}
            />
            <Stat
              testId="finance-owed"
              label={t('finance.owed')}
              value={formatCurrency(data.owed.pending)}
              to="/fee/pending"
              hint={t('finance.owedHint', {
                overdue: formatCurrency(data.owed.overdue),
                count: data.owed.learnersOwing,
              })}
            />
          </div>

          <Card>
            <CardContent className="pt-4">
              <h2 className="mb-3 text-sm font-semibold">{t('finance.trend')}</h2>
              <MonthlyMoneyChart data={data.trend} />
            </CardContent>
          </Card>

          <div className="grid gap-3 md:grid-cols-2">
            <Breakdown
              testId="finance-categories"
              title={t('finance.byCategory')}
              rows={data.categories}
              labelOf={categoryLabel}
              total={data.spent}
              empty={t('finance.noSpend')}
            />
            <Breakdown
              testId="finance-methods"
              title={t('finance.byMethod')}
              rows={data.methods}
              labelOf={methodLabel}
              total={data.collected}
              empty={t('finance.noCollection')}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t('finance.note')}</p>
        </>
      )}
    </div>
  );
}
