import { useState } from 'react';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../../components/ui/Card.jsx';
import { Progress } from '../../components/ui/progress.jsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { useClassSections } from '../../hooks/useClassSections.js';
import { formatCurrency } from '../../utils/intl.js';

const selectCls =
  'h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

function ComponentRows({ components, onAdd, onRemove, onUpdate }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t('fee.structures.components')}</span>
        <Button type="button" size="sm" variant="outline" onClick={onAdd}>
          {t('fee.structures.addRow')}
        </Button>
      </div>
      {components.map((c, i) => (
        <div key={i} className="flex gap-2 items-center">
          <Input
            placeholder={t('fee.structures.labelPlaceholder')}
            value={c.label}
            onChange={(e) => onUpdate(i, 'label', e.target.value)}
            required
          />
          <Input
            placeholder={t('fee.structures.amountPlaceholder')}
            type="number"
            value={c.amount}
            onChange={(e) => onUpdate(i, 'amount', e.target.value)}
            required
            min="0"
          />
          <label className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 whitespace-nowrap">
            <input
              type="checkbox"
              checked={c.isOptional || false}
              onChange={(e) => onUpdate(i, 'isOptional', e.target.checked)}
            />
            {t('fee.structures.optional')}
          </label>
          {components.length > 1 && (
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="text-destructive hover:text-destructive/80 text-sm px-2 shrink-0"
            >
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function NewStructureModal({ open, onOpenChange }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [yearId, setYearId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [components, setComponents] = useState([{ label: '', amount: '', isOptional: false }]);
  const [error, setError] = useState('');

  const { data: years = [] } = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => api.get('/academic/years').then((r) => r.data),
  });

  function addComponent() {
    setComponents((prev) => [...prev, { label: '', amount: '', isOptional: false }]);
  }

  function removeComponent(i) {
    setComponents((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateComponent(i, field, value) {
    setComponents((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  }

  const mutation = useMutation({
    mutationFn: () =>
      api
        .post('/fee/structures', {
          name,
          academicYearId: yearId,
          dueDate: dueDate || undefined,
          components: components.map((c) => ({
            label: c.label,
            amount: Number(c.amount),
            isOptional: c.isOptional || false,
          })),
        })
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fee-structures'] });
      onOpenChange(false);
      setName('');
      setYearId('');
      setDueDate('');
      setComponents([{ label: '', amount: '', isOptional: false }]);
      setError('');
    },
    onError: (err) => setError(err.response?.data?.error || t('fee.structures.createFailed')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('fee.structures.newFeeStructureTitle')}</DialogTitle>
        </DialogHeader>
        <form
          id="new-structure"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="flex flex-col gap-4"
        >
          <Input
            label={t('common.name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{t('fee.structures.academicYear')}</label>
            <select
              value={yearId}
              onChange={(e) => setYearId(e.target.value)}
              required
              className={selectCls}
            >
              <option value="">{t('fee.structures.selectYearPlaceholder')}</option>
              {years.map((y) => (
                <option key={y._id} value={y._id}>
                  {y.name}
                </option>
              ))}
            </select>
          </div>
          <Input
            label={t('fee.structures.dueDateOptional')}
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />

          <ComponentRows
            components={components}
            onAdd={addComponent}
            onRemove={removeComponent}
            onUpdate={updateComponent}
          />

          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="new-structure" disabled={mutation.isPending}>
            {mutation.isPending ? t('fee.structures.creating') : t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditStructureModal({ open, onOpenChange, structure }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState(structure.name);
  const [dueDate, setDueDate] = useState(structure.dueDate ? structure.dueDate.slice(0, 10) : '');
  const [components, setComponents] = useState(
    (structure.components || []).map((c) => ({ ...c, amount: String(c.amount) }))
  );
  const [error, setError] = useState('');

  function addComponent() {
    setComponents((prev) => [...prev, { label: '', amount: '', isOptional: false }]);
  }

  function removeComponent(i) {
    setComponents((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateComponent(i, field, value) {
    setComponents((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  }

  const mutation = useMutation({
    mutationFn: () =>
      api
        .patch(`/fee/structures/${structure._id}`, {
          name,
          dueDate: dueDate || undefined,
          components: components.map((c) => ({
            label: c.label,
            amount: Number(c.amount),
            isOptional: c.isOptional || false,
          })),
        })
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fee-structures'] });
      onOpenChange(false);
      setError('');
    },
    onError: (err) => setError(err.response?.data?.error || t('fee.structures.updateFailed')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('fee.structures.editFeeStructureTitle')}</DialogTitle>
        </DialogHeader>
        <form
          id="edit-structure"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="flex flex-col gap-4"
        >
          <Input
            label={t('common.name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            label={t('fee.structures.dueDateOptional')}
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />

          <ComponentRows
            components={components}
            onAdd={addComponent}
            onRemove={removeComponent}
            onUpdate={updateComponent}
          />

          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="edit-structure" disabled={mutation.isPending}>
            {mutation.isPending ? t('common.saving') : t('fee.structures.saveChanges')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeactivateConfirmDialog({ open, onOpenChange, structure }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const willDeactivate = structure?.isActive !== false;

  const mutation = useMutation({
    mutationFn: () =>
      api
        .patch(`/fee/structures/${structure._id}/${willDeactivate ? 'deactivate' : 'activate'}`)
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fee-structures'] });
      onOpenChange(false);
      setError('');
    },
    onError: (err) => setError(err.response?.data?.error || t('fee.structures.statusUpdateFailed')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {willDeactivate
              ? t('fee.structures.deactivateTitle')
              : t('fee.structures.activateTitle')}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {willDeactivate
            ? t('fee.structures.deactivateBody', { name: structure?.name })
            : t('fee.structures.activateBody', { name: structure?.name })}
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? t('common.saving') : t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignToSectionModal({ open, onOpenChange, structure }) {
  const { t } = useTranslation();
  const [sectionId, setSectionId] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const { data: sections = [] } = useQuery({
    queryKey: ['sections-all'],
    queryFn: () => api.get('/academic/sections').then((r) => r.data),
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/fee/structures/${structure._id}/assign`, { sectionId }).then((r) => r.data),
    onSuccess: (data) => setResult(data),
    onError: (err) => setError(err.response?.data?.error || t('fee.structures.assignmentFailed')),
  });

  function handleClose() {
    onOpenChange(false);
    setResult(null);
    setSectionId('');
    setError('');
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('fee.structures.assignToSectionTitle')}</DialogTitle>
        </DialogHeader>
        {result ? (
          <p className="text-sm text-muted-foreground">
            {t('fee.structures.assignDone', { created: result.created, skipped: result.skipped })}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {t('fee.structures.structureLabel')}{' '}
              <strong className="text-foreground">{structure?.name}</strong>
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">{t('fee.structures.section')}</label>
              <select
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                className={selectCls}
              >
                <option value="">{t('fee.structures.selectSectionPlaceholder')}</option>
                {sections.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.classId?.name} — {s.name}
                  </option>
                ))}
              </select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {result ? t('common.close') : t('common.cancel')}
          </Button>
          {!result && (
            <Button onClick={() => mutation.mutate()} disabled={!sectionId || mutation.isPending}>
              {mutation.isPending ? t('fee.structures.assigning') : t('fee.structures.assign')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Renders the collection-rate bar inline on every structure card (Mock 2, approved) —
// the summary query itself now runs at the page level via useQueries (see §3 "State &
// logic" in docs/mobile-ui/16-fee-structures-approved.html) so every visible card's
// summary fires immediately instead of being fetched lazily per card. This component
// stays purely presentational: a failed/pending fetch for one card just renders nothing
// here, leaving the components/total block above it intact (spec §5).
function StructureSummary({ summaryQuery }) {
  const { t } = useTranslation();
  const { data, isError } = summaryQuery || {};

  if (!data || isError) return null;

  const totalOwed = data.collectedAmount + data.outstandingAmount;
  const pct = totalOwed > 0 ? Math.round((data.collectedAmount / totalOwed) * 100) : 0;

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <p className="text-xs text-muted-foreground mb-2">
        {t('fee.structures.assignedCount', { count: data.assignedCount })}
      </p>
      <Progress value={pct} aria-label={t('fee.structures.pctCollectedAria', { pct })} />
      <div className="flex items-center justify-between mt-1.5 text-xs text-muted-foreground">
        <span>{t('fee.structures.pctCollected', { pct })}</span>
        <span>
          {t('fee.structures.collectedOfTotal', {
            collected: formatCurrency(data.collectedAmount),
            total: formatCurrency(totalOwed),
          })}
        </span>
      </div>
    </div>
  );
}

export default function FeeStructuresPage() {
  const { t } = useTranslation();
  const [yearId, setYearId] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [assignFor, setAssignFor] = useState(null);
  const [editFor, setEditFor] = useState(null);
  const [deactivateFor, setDeactivateFor] = useState(null);

  const { data: years = [] } = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => api.get('/academic/years').then((r) => r.data),
  });

  const { classes } = useClassSections();

  const { data: discounts = [] } = useQuery({
    queryKey: ['fee-discounts'],
    queryFn: () => api.get('/fee/discounts').then((r) => r.data),
  });

  const { data: structures = [], isLoading } = useQuery({
    queryKey: ['fee-structures', yearId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (yearId) params.set('yearId', yearId);
      return api.get(`/fee/structures?${params}`).then((r) => r.data);
    },
  });

  const filtered = structures.filter((s) => {
    const matchesSearch = !search || s.name.toLowerCase().includes(search.toLowerCase());
    const matchesClass = !classFilter || s.classId?._id === classFilter;
    return matchesSearch && matchesClass;
  });

  // Fired for every visible card up front (not on-demand behind a click) — see
  // §2 "API contracts" / §3 "State & logic" in the approved mobile spec.
  const summaryQueries = useQueries({
    queries: filtered.map((s) => ({
      queryKey: ['fee-structure-summary', s._id],
      queryFn: () => api.get(`/fee/structures/${s._id}/summary`).then((r) => r.data),
    })),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('nav.feeStructures')}
        action={
          <Button onClick={() => setShowNew(true)}>{t('fee.structures.newStructure')}</Button>
        }
      />

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder={t('fee.structures.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <select
          aria-label={t('fee.structures.academicYear')}
          value={yearId}
          onChange={(e) => setYearId(e.target.value)}
          className="h-9 rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">{t('common.allYears')}</option>
          {years.map((y) => (
            <option key={y._id} value={y._id}>
              {y.name}
            </option>
          ))}
        </select>
        <select
          aria-label={t('fee.structures.classLabel')}
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="h-9 rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">{t('common.allClasses')}</option>
          {classes.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-muted-foreground">{t('common.loading')}</p>}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((s, i) => {
          const applicableDiscounts = discounts.filter(
            (d) =>
              d.academicYearId === s.academicYearId?._id &&
              (d.applicableTo === 'all' ||
                (d.applicableTo === 'class' && d.classId === s.classId?._id))
          );

          return (
            <Card key={s._id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{s.name}</CardTitle>
                  <div className="flex gap-1">
                    {s.isActive === false ? (
                      <Badge variant="danger">{t('fee.structures.inactive')}</Badge>
                    ) : (
                      <Badge variant="success">{t('fee.structures.active')}</Badge>
                    )}
                    {applicableDiscounts.length > 0 && (
                      <Badge
                        variant="secondary"
                        title={applicableDiscounts.map((d) => d.name).join(', ')}
                      >
                        {t('fee.structures.discountCount', { count: applicableDiscounts.length })}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-2">{s.academicYearId?.name}</p>
                <ul className="text-sm space-y-1">
                  {(s.components || []).map((c, i) => (
                    <li key={i} className="flex justify-between">
                      <span className="text-muted-foreground">
                        {c.label}
                        {c.isOptional && t('fee.structures.optionalSuffix')}
                      </span>
                      <span className="font-medium">{formatCurrency(c.amount)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 pt-3 border-t border-border flex justify-between text-sm font-semibold">
                  <span>{t('fee.structures.total')}</span>
                  <span>
                    {formatCurrency((s.components || []).reduce((sum, c) => sum + c.amount, 0))}
                  </span>
                </div>
                <StructureSummary summaryQuery={summaryQueries[i]} />
              </CardContent>
              <CardFooter className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setAssignFor(s)}>
                  {t('fee.structures.assignToSectionTitle')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditFor(s)}>
                  {t('common.edit')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDeactivateFor(s)}>
                  {s.isActive === false
                    ? t('fee.structures.activate')
                    : t('fee.structures.deactivate')}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
        {filtered.length === 0 && !isLoading && (
          <p className="text-muted-foreground col-span-3">{t('fee.structures.noneFound')}</p>
        )}
      </div>

      <NewStructureModal open={showNew} onOpenChange={setShowNew} />
      <AssignToSectionModal
        open={Boolean(assignFor)}
        onOpenChange={(v) => !v && setAssignFor(null)}
        structure={assignFor}
      />
      {editFor && (
        <EditStructureModal
          open={Boolean(editFor)}
          onOpenChange={(v) => !v && setEditFor(null)}
          structure={editFor}
        />
      )}
      {deactivateFor && (
        <DeactivateConfirmDialog
          open={Boolean(deactivateFor)}
          onOpenChange={(v) => !v && setDeactivateFor(null)}
          structure={deactivateFor}
        />
      )}
    </div>
  );
}
