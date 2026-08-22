import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { useAuth } from '../../contexts/useAuth.js';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import YearCard from '../../components/academic-years/YearCard.jsx';
import AddTermSheet from '../../components/academic-years/AddTermSheet.jsx';
import ActivateConfirm from '../../components/academic-years/ActivateConfirm.jsx';

// Unchanged from today except the copy: creating a year auto-activates it and
// deactivates every other one (POST /academic/years does this server-side in
// one transaction-less updateMany-then-create), so the dialog says so up front
// instead of surprising the admin after the fact.
function CreateYearModal({ open, onOpenChange, currentActiveName }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '' });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (data) => api.post('/academic/years', data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-years'] });
      onOpenChange(false);
      setForm({ name: '', startDate: '', endDate: '' });
      setError('');
    },
    onError: (err) => setError(err.response?.data?.error || t('academic.years.createFailed')),
  });

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('academic.years.modalTitle')}</DialogTitle>
        </DialogHeader>
        <form
          id="create-year"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(form);
          }}
          className="flex flex-col gap-4"
        >
          <Input
            label={t('common.name')}
            value={form.name}
            onChange={update('name')}
            required
            placeholder="2025–26"
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
          <p className="text-xs text-muted-foreground">
            {t('academic.years.activateNotice', {
              replacing: currentActiveName
                ? t('academic.years.replacingSuffix', { name: currentActiveName })
                : '',
            })}
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="create-year" disabled={mutation.isPending}>
            {mutation.isPending ? t('academic.years.creating') : t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AcademicYearsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canWrite = (user?.permissions ?? []).includes('tenant:admin');
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  // The active year is always expanded regardless of this value (see
  // isExpanded below) — this only tracks which *inactive* year, if any, the
  // user has manually expanded. Single id, not a set: expanding one inactive
  // year collapses whichever other inactive year was open (accordion).
  const [expandedYearId, setExpandedYearId] = useState(null);
  const [addTermFor, setAddTermFor] = useState(null); // yearId | null
  const [confirmActivate, setConfirmActivate] = useState(null); // year | null

  const {
    data: years = [],
    isLoading: yearsLoading,
    error: yearsError,
  } = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => api.get('/academic/years').then((r) => r.data),
  });

  // One unfiltered call for every term the tenant has, grouped client-side by
  // year — the dataset is small and bounded (spec: ~3 years / 6 terms), so
  // this is cheaper than a lazy per-year fetch and it's the only way to show
  // an accurate "N terms" count on collapsed (never-expanded) cards, which
  // the Definition of Done requires.
  const { data: allTerms = [] } = useQuery({
    queryKey: ['academic-terms'],
    queryFn: () => api.get('/academic/terms').then((r) => r.data),
  });

  const termsByYear = useMemo(() => {
    const map = {};
    for (const term of allTerms) {
      const key = term.academicYearId;
      if (!map[key]) map[key] = [];
      map[key].push(term);
    }
    return map;
  }, [allTerms]);

  const activeYear = years.find((y) => y.isActive);

  const activateMutation = useMutation({
    mutationFn: (id) => api.patch(`/academic/years/${id}/activate`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-years'] });
      setConfirmActivate(null);
    },
  });

  function isExpanded(year) {
    return year.isActive || year._id === expandedYearId;
  }

  function handleToggle(year) {
    setExpandedYearId((prev) => (prev === year._id ? null : year._id));
  }

  function cancelActivate() {
    activateMutation.reset();
    setConfirmActivate(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('academic.years.title')}
        description={`${t('academic.years.yearCount', { count: years.length })} · ${t('academic.years.termCount', { count: allTerms.length })}`}
        action={
          canWrite && (
            <Button onClick={() => setShowCreate(true)}>{t('academic.years.newYear')}</Button>
          )
        }
      />

      {yearsError && <p className="text-sm text-destructive">{t('academic.years.loadError')}</p>}

      {yearsLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}

      {!yearsLoading && !yearsError && years.length === 0 && (
        <EmptyState
          title={t('academic.years.emptyTitle')}
          description={canWrite ? t('academic.years.emptyDescription') : undefined}
        />
      )}

      <div className="flex flex-col gap-3">
        {years.map((year) => (
          <YearCard
            key={year._id}
            year={year}
            terms={termsByYear[year._id] ?? []}
            expanded={isExpanded(year)}
            onToggle={() => handleToggle(year)}
            onSetActive={() => setConfirmActivate(year)}
            onAddTerm={() => setAddTermFor(year._id)}
            canWrite={canWrite}
          />
        ))}
      </div>

      <CreateYearModal
        open={showCreate}
        onOpenChange={setShowCreate}
        currentActiveName={activeYear?.name}
      />

      <AddTermSheet
        open={Boolean(addTermFor)}
        yearId={addTermFor}
        existingTerms={addTermFor ? (termsByYear[addTermFor] ?? []) : []}
        onClose={() => setAddTermFor(null)}
      />

      <ActivateConfirm
        year={confirmActivate}
        isPending={activateMutation.isPending}
        error={activateMutation.isError}
        onConfirm={() => activateMutation.mutate(confirmActivate._id)}
        onCancel={cancelActivate}
      />
    </div>
  );
}
