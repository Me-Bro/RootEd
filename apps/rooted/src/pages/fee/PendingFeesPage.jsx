import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import api from '../../lib/api.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { Card, CardContent } from '../../components/ui/Card.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { DataTable, TableRow, TableCell } from '../../components/ui/DataTable.jsx';
import { RecordList, RecordListItem } from '../../components/ui/RecordList.jsx';
import WhatsappReminder from '../../components/study/WhatsappReminder.jsx';
import { useAuth } from '../../contexts/useAuth.js';
import { formatCurrency } from '../../utils/intl.js';
import { formatMonth } from '../../utils/studyCenter.js';
import { studentLink } from '../../utils/studentLink.js';

const TABS = ['student', 'month'];

const Reminder = ({ l }) => (
  <WhatsappReminder number={l.whatsapp} name={l.name} amount={l.pending} overdue={l.overdue} />
);

function Stat({ label, value, tone, testId }) {
  return (
    <Card data-testid={testId}>
      <CardContent className="pt-4">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-bold ${tone ?? 'text-foreground'}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

// Who owes the centre money, per learner or per month. A plan's balance is computed
// from its billing cycles on the server, so this agrees with each learner's own page.
export default function PendingFeesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [view, setView] = useState('student');
  const [q, setQ] = useState('');
  const canOpenLearner = (user?.permissions ?? []).includes('students:read');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['pending-fees', view, view === 'student' ? q : ''],
    queryFn: () =>
      api
        .get('/fee/reports/pending', {
          params: { view, ...(view === 'student' && q ? { q } : {}) },
        })
        .then((r) => r.data),
  });

  const learners = data?.learners ?? [];
  const months = data?.months ?? [];
  const totals = data?.totals;
  const tabLabels = { student: t('pendingFees.byStudent'), month: t('pendingFees.byMonth') };

  const name = (l) =>
    canOpenLearner ? (
      <Link
        className="hover:underline"
        {...studentLink(l.studentId, { from: 'pending', tab: 'billing' })}
      >
        {l.name}
      </Link>
    ) : (
      l.name
    );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('pendingFees.title')} description={t('pendingFees.description')} />

      {totals && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat
            testId="pending-total"
            label={t('pendingFees.totalPending')}
            value={formatCurrency(totals.pending)}
          />
          <Stat
            testId="pending-overdue"
            label={t('pendingFees.overdue')}
            value={formatCurrency(totals.overdue)}
            tone={totals.overdue > 0 ? 'text-destructive' : undefined}
          />
          <Stat
            testId="pending-learners"
            label={t('pendingFees.learnersOwing')}
            value={totals.learnersOwing}
          />
        </div>
      )}

      <div className="flex gap-1 border-b border-border" role="tablist">
        {TABS.map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={[
              'whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              view === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {tabLabels[id]}
          </button>
        ))}
      </div>

      {view === 'student' ? (
        <>
          <div className="max-w-xs">
            <Input
              id="pending-search"
              type="search"
              label={t('pendingFees.search')}
              placeholder={t('pendingFees.searchHint')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <RecordList
            isLoading={isLoading}
            isError={isError}
            onRetry={refetch}
            isEmpty={learners.length === 0}
            emptyMessage={t('pendingFees.noneStudent')}
          >
            {learners.map((l) => (
              <RecordListItem
                key={l.studentId}
                title={name(l)}
                meta={[l.admissionNo, l.phone].filter(Boolean).join(' · ')}
                trailing={
                  <span className="flex flex-col items-end gap-1">
                    <span className="text-sm font-semibold">{formatCurrency(l.pending)}</span>
                    <Reminder l={l} />
                  </span>
                }
                footer={
                  <p className="text-xs text-muted-foreground">
                    {t('pendingFees.overdueShort', { amount: formatCurrency(l.overdue) })}
                    {' · '}
                    {t('pendingFees.currentShort', { amount: formatCurrency(l.current) })}
                    {l.oldestMonth &&
                      ` · ${t('pendingFees.since', { month: formatMonth(l.oldestMonth) })}`}
                  </p>
                }
              />
            ))}
          </RecordList>

          <DataTable
            className="hidden md:block"
            headers={[
              t('pendingFees.learner'),
              t('pendingFees.admissionNo'),
              t('pendingFees.phone'),
              t('pendingFees.overdue'),
              t('pendingFees.currentCycle'),
              t('pendingFees.pending'),
              t('pendingFees.oldest'),
              t('studyCenter.whatsapp.remind'),
            ]}
            isLoading={isLoading}
            isEmpty={learners.length === 0}
            emptyMessage={t('pendingFees.noneStudent')}
          >
            {learners.map((l) => (
              <TableRow key={l.studentId} className="bg-card" data-testid="pending-row">
                <TableCell className="px-4 py-3 font-medium">{name(l)}</TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">
                  {l.admissionNo ?? '—'}
                </TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">{l.phone ?? '—'}</TableCell>
                <TableCell className="px-4 py-3">{formatCurrency(l.overdue)}</TableCell>
                <TableCell className="px-4 py-3">{formatCurrency(l.current)}</TableCell>
                <TableCell className="px-4 py-3 font-semibold">
                  {formatCurrency(l.pending)}
                </TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">
                  {l.oldestMonth ? formatMonth(l.oldestMonth) : '—'}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <Reminder l={l} />
                </TableCell>
              </TableRow>
            ))}
          </DataTable>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{t('pendingFees.monthNote')}</p>
          <RecordList
            isLoading={isLoading}
            isError={isError}
            onRetry={refetch}
            isEmpty={months.length === 0}
            emptyMessage={t('pendingFees.noneMonth')}
          >
            {months.map((m) => (
              <RecordListItem
                key={m.month}
                title={`${formatMonth(m.month)} · ${formatCurrency(m.pending)}`}
                meta={t('pendingFees.monthMeta', {
                  billed: formatCurrency(m.billed),
                  paid: formatCurrency(m.paid),
                  count: m.learnersOwing,
                })}
                trailing={
                  <Badge variant={m.status === 'closed' ? 'default' : 'warning'}>
                    {t(`pendingFees.status.${m.status}`)}
                  </Badge>
                }
              />
            ))}
          </RecordList>

          <DataTable
            className="hidden md:block"
            headers={[
              t('pendingFees.month'),
              t('pendingFees.billed'),
              t('pendingFees.collected'),
              t('pendingFees.pending'),
              t('pendingFees.learnersOwing'),
              t('common.status'),
            ]}
            isLoading={isLoading}
            isEmpty={months.length === 0}
            emptyMessage={t('pendingFees.noneMonth')}
          >
            {months.map((m) => (
              <TableRow key={m.month} className="bg-card" data-testid="pending-month-row">
                <TableCell className="px-4 py-3 font-medium">{formatMonth(m.month)}</TableCell>
                <TableCell className="px-4 py-3">{formatCurrency(m.billed)}</TableCell>
                <TableCell className="px-4 py-3">{formatCurrency(m.paid)}</TableCell>
                <TableCell className="px-4 py-3 font-semibold">
                  {formatCurrency(m.pending)}
                </TableCell>
                <TableCell className="px-4 py-3">{m.learnersOwing}</TableCell>
                <TableCell className="px-4 py-3">
                  <Badge variant={m.status === 'closed' ? 'default' : 'warning'}>
                    {t(`pendingFees.status.${m.status}`)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </DataTable>
        </>
      )}
    </div>
  );
}
