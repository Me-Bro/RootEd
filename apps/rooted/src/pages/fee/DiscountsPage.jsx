import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card, CardContent } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { SelectField, SelectItem } from '../../components/ui/SelectField.jsx';
import { DataTable, TableRow, TableCell } from '../../components/ui/DataTable.jsx';
import LearnerPicker from '../../components/study/LearnerPicker.jsx';
import { formatCurrency, formatDate } from '../../utils/intl.js';
import { apiError } from '../../utils/studyCenter.js';

const blank = { name: '', type: 'percentage', value: '', scope: 'all', validFrom: '', validTo: '' };

// The owner's discount catalog. A discount for everybody can be picked at the desk
// (when the centre's policy allows it); one set up for a single learner must have an
// end date and is applied to that learner's sales automatically.
export default function DiscountsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(blank);
  const [learner, setLearner] = useState(null);
  const [error, setError] = useState('');

  const years = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => api.get('/academic/years').then((r) => r.data),
  });
  const discounts = useQuery({
    queryKey: ['fee-discounts', 'catalog'],
    queryFn: () => api.get('/fee/discounts', { params: { withStudent: true } }).then((r) => r.data),
  });

  const yearId = (years.data ?? []).find((y) => y.isActive)?._id;
  const forOne = form.scope === 'student';
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const create = useMutation({
    mutationFn: () =>
      api.post('/fee/discounts', {
        name: form.name,
        type: form.type,
        value: Number(form.value),
        applicableTo: forOne ? 'student' : 'all',
        ...(forOne ? { studentId: learner?._id } : {}),
        academicYearId: yearId,
        ...(form.validFrom ? { validFrom: form.validFrom } : {}),
        ...(form.validTo ? { validTo: form.validTo } : {}),
      }),
    onSuccess: () => {
      setError('');
      setForm(blank);
      setLearner(null);
      queryClient.invalidateQueries({ queryKey: ['fee-discounts'] });
    },
    onError: (err) => {
      setError(apiError(err, t('studyCenter.discounts.failed')));
    },
  });

  const ready =
    form.name.trim() && Number(form.value) > 0 && yearId && (!forOne || (learner && form.validTo));

  const rows = discounts.data ?? [];
  const describe = (d) => (d.type === 'percentage' ? `${d.value}%` : formatCurrency(d.value));
  const window = (d) =>
    [d.validFrom && formatDate(d.validFrom), d.validTo && formatDate(d.validTo)]
      .filter(Boolean)
      .join(' – ') || t('studyCenter.discounts.noEnd');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('studyCenter.discounts.title')}
        description={t('studyCenter.discounts.description')}
      />

      <Card>
        <CardContent className="flex flex-col gap-4 pt-4">
          <h2 className="text-sm font-semibold">{t('studyCenter.discounts.add')}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input
              id="discount-name"
              label={t('common.name')}
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
            />
            <SelectField
              label={t('studyCenter.discounts.type')}
              value={form.type}
              onValueChange={(v) => set({ type: v })}
            >
              <SelectItem value="percentage">{t('studyCenter.discounts.percentage')}</SelectItem>
              <SelectItem value="flat">{t('studyCenter.discounts.flat')}</SelectItem>
            </SelectField>
            <Input
              id="discount-value"
              type="number"
              min="1"
              label={t('studyCenter.discounts.value')}
              value={form.value}
              onChange={(e) => set({ value: e.target.value })}
            />
          </div>

          <SelectField
            label={t('studyCenter.discounts.appliesTo')}
            value={form.scope}
            onValueChange={(v) => set({ scope: v })}
          >
            <SelectItem value="all">{t('studyCenter.discounts.everyone')}</SelectItem>
            <SelectItem value="student">{t('studyCenter.discounts.oneLearner')}</SelectItem>
          </SelectField>

          {forOne && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                {t('studyCenter.discounts.oneLearnerHint')}
              </p>
              <LearnerPicker value={learner} onChange={setLearner} />
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              id="discount-from"
              type="date"
              label={t('studyCenter.discounts.validFrom')}
              value={form.validFrom}
              onChange={(e) => set({ validFrom: e.target.value })}
            />
            <Input
              id="discount-to"
              type="date"
              label={
                forOne
                  ? t('studyCenter.discounts.validToRequired')
                  : t('studyCenter.discounts.validTo')
              }
              value={form.validTo}
              onChange={(e) => set({ validTo: e.target.value })}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div>
            <Button disabled={!ready || create.isPending} onClick={() => create.mutate()}>
              {t('studyCenter.discounts.create')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <DataTable
        headers={[
          t('common.name'),
          t('studyCenter.discounts.value'),
          t('studyCenter.discounts.appliesTo'),
          t('studyCenter.discounts.dates'),
        ]}
        isLoading={discounts.isLoading}
        isEmpty={!discounts.isLoading && rows.length === 0}
        emptyMessage={t('studyCenter.discounts.empty')}
      >
        {rows.map((d) => (
          <TableRow key={d._id}>
            <TableCell className="font-medium">{d.name}</TableCell>
            <TableCell>{describe(d)}</TableCell>
            <TableCell>
              {d.applicableTo === 'student'
                ? (d.studentName ?? t('studyCenter.discounts.oneLearner'))
                : t('studyCenter.discounts.everyone')}
            </TableCell>
            <TableCell>{window(d)}</TableCell>
          </TableRow>
        ))}
      </DataTable>
    </div>
  );
}
