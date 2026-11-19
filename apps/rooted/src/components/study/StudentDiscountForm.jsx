import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { SelectField, SelectItem } from '../ui/SelectField.jsx';
import { apiError } from '../../utils/studyCenter.js';
import { standingDiscountPayload } from '../../utils/feePlan.js';

const blank = { name: '', type: 'percentage', value: '', validFrom: '', validTo: '' };
const prefix = 'studyCenter.discounts';

/**
 * Sets a standing discount for one learner, from their own page (the owner only; the
 * server refuses anyone else). It applies to every cycle they are billed inside its
 * dates, so it must have an end date.
 */
export default function StudentDiscountForm({ studentId, onDone }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const years = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => api.get('/academic/years').then((r) => r.data),
  });
  const yearId = (years.data ?? []).find((y) => y.isActive)?._id;
  const payload = standingDiscountPayload({ form, studentId, yearId });

  const create = useMutation({
    mutationFn: () => api.post('/fee/discounts', payload),
    onSuccess: () => {
      setError('');
      setForm(blank);
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['student-discounts', studentId] });
      onDone?.();
    },
    onError: (err) => setError(apiError(err, t(`${prefix}.failed`))),
  });

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="w-fit" onClick={() => setOpen(true)}>
        {t('studyCenter.studentBilling.addDiscount')}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input
          id="student-discount-name"
          label={t('common.name')}
          value={form.name}
          onChange={(e) => set({ name: e.target.value })}
        />
        <SelectField
          label={t(`${prefix}.type`)}
          value={form.type}
          onValueChange={(v) => set({ type: v })}
        >
          <SelectItem value="percentage">{t(`${prefix}.percentage`)}</SelectItem>
          <SelectItem value="flat">{t(`${prefix}.flat`)}</SelectItem>
        </SelectField>
        <Input
          id="student-discount-value"
          type="number"
          min="1"
          label={t(`${prefix}.value`)}
          value={form.value}
          onChange={(e) => set({ value: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          id="student-discount-from"
          type="date"
          label={t(`${prefix}.validFrom`)}
          value={form.validFrom}
          onChange={(e) => set({ validFrom: e.target.value })}
        />
        <Input
          id="student-discount-to"
          type="date"
          label={t(`${prefix}.validToRequired`)}
          value={form.validTo}
          onChange={(e) => set({ validTo: e.target.value })}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t(`${prefix}.oneLearnerHint`)}</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={!payload || create.isPending} onClick={() => create.mutate()}>
          {t(`${prefix}.create`)}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
