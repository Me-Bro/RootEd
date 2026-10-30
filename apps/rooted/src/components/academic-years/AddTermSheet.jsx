import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet.jsx';

const EMPTY_FORM = { name: '', startDate: '', endDate: '' };

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

function findOverlap(form, existingTerms) {
  if (!form.startDate || !form.endDate) return null;
  const start = new Date(form.startDate);
  const end = new Date(form.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return (
    existingTerms.find((t) =>
      rangesOverlap(start, end, new Date(t.startDate), new Date(t.endDate))
    ) ?? null
  );
}

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// POST /academic/terms has no server-side overlap check (see spec §2), so
// this warning is advisory only — it never blocks submission.
export default function AddTermSheet({ open, yearId, existingTerms, onClose }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function resetAndClose() {
    onClose();
    setForm(EMPTY_FORM);
    setError('');
  }

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/academic/terms', { academicYearId: yearId, ...form }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-terms'] });
      resetAndClose();
    },
    onError: (err) => setError(err.response?.data?.error || t('academic.years.createTermFailed')),
  });

  const overlap = findOverlap(form, existingTerms ?? []);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && resetAndClose()}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{t('academic.years.addTermTitle')}</SheetTitle>
          <SheetDescription>{t('academic.years.addTermDescription')}</SheetDescription>
        </SheetHeader>
        <form
          id="add-term-form"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="flex flex-col gap-4 px-4"
        >
          <Input
            label={t('common.name')}
            value={form.name}
            onChange={update('name')}
            required
            placeholder={t('academic.years.termNamePlaceholder')}
          />
          <Input
            label={t('academic.years.startDate')}
            type="date"
            value={form.startDate}
            onChange={update('startDate')}
            required
          />
          <Input
            label={t('academic.years.endDate')}
            type="date"
            value={form.endDate}
            onChange={update('endDate')}
            required
          />
          {overlap && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {t('academic.years.overlapsWarning', {
                name: overlap.name,
                start: formatDate(overlap.startDate),
                end: formatDate(overlap.endDate),
              })}
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <div className="flex justify-end gap-2 px-4 pb-4">
          <Button variant="outline" onClick={resetAndClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="add-term-form" disabled={mutation.isPending}>
            {mutation.isPending ? t('academic.years.adding') : t('academic.years.addTermButton')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
