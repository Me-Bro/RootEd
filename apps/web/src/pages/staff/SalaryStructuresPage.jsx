import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { useAuth } from '../../contexts/useAuth.js';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../../components/ui/Card.jsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { formatCurrency } from '../../utils/intl.js';

const selectCls =
  'h-9 rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

function makeEmptyComponent() {
  return {
    id: crypto.randomUUID(),
    label: '',
    type: 'earning',
    amount: '',
    isPercentage: false,
    baseRef: '',
  };
}

// Deep-clones a source structure's components for the "Duplicate" flow with
// fresh ids, remapping baseRef through the same old-id->new-id map so
// percentage relationships survive the clone.
function cloneComponents(components) {
  const idMap = new Map(components.map((c) => [c.id, crypto.randomUUID()]));
  return components.map((c) => ({
    ...c,
    id: idMap.get(c.id),
    amount: String(c.amount),
    baseRef: c.isPercentage ? (idMap.get(c.baseRef) ?? '') : '',
  }));
}

function extractErrorMessage(err, fallback) {
  const data = err.response?.data;
  if (data?.details) {
    const messages = Object.values(data.details).flat().filter(Boolean);
    if (messages.length) return messages.join(', ');
  }
  return data?.error || fallback;
}

function baseRefLabel(components, baseRef) {
  return components.find((c) => c.id === baseRef)?.label || baseRef;
}

function SalaryComponentRows({ components, onAdd, onRemove, onUpdate }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Components</span>
        <Button type="button" size="sm" variant="outline" onClick={onAdd}>
          + Add Row
        </Button>
      </div>
      {components.map((c, i) => {
        const baseOptions = components.filter((sib, idx) => idx !== i && !sib.isPercentage);
        return (
          <div key={c.id} className="flex gap-2 items-center flex-wrap">
            <Input
              placeholder="Label (e.g. Basic)"
              value={c.label}
              onChange={(e) => onUpdate(i, 'label', e.target.value)}
              required
              className="max-w-[160px]"
            />
            <select
              value={c.type}
              onChange={(e) => onUpdate(i, 'type', e.target.value)}
              className={selectCls}
            >
              <option value="earning">Earning</option>
              <option value="deduction">Deduction</option>
            </select>
            <Input
              placeholder={c.isPercentage ? 'Percent' : 'Amount'}
              type="number"
              value={c.amount}
              onChange={(e) => onUpdate(i, 'amount', e.target.value)}
              required
              min="0"
              className="max-w-[120px]"
            />
            <label className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 whitespace-nowrap">
              <input
                type="checkbox"
                checked={c.isPercentage || false}
                onChange={(e) => onUpdate(i, 'isPercentage', e.target.checked)}
              />
              % of another component
            </label>
            {c.isPercentage && (
              <select
                value={c.baseRef || ''}
                onChange={(e) => onUpdate(i, 'baseRef', e.target.value)}
                required
                className={selectCls}
              >
                <option value="" disabled>
                  Base component…
                </option>
                {baseOptions.map((sib) => (
                  <option key={sib.id} value={sib.id}>
                    {sib.label || '(unnamed)'}
                  </option>
                ))}
              </select>
            )}
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
        );
      })}
    </div>
  );
}

function useComponentsEditor(initial) {
  const [components, setComponents] = useState(initial);

  function addComponent() {
    setComponents((prev) => [...prev, makeEmptyComponent()]);
  }
  function removeComponent(i) {
    setComponents((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateComponent(i, field, value) {
    setComponents((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  }

  return { components, setComponents, addComponent, removeComponent, updateComponent };
}

function componentsPayload(components) {
  return components.map((c) => ({
    id: c.id,
    label: c.label,
    type: c.type,
    amount: Number(c.amount),
    isPercentage: c.isPercentage || false,
    baseRef: c.isPercentage ? c.baseRef : undefined,
  }));
}

function NewSalaryStructureModal({
  open,
  onOpenChange,
  initialName = '',
  initialComponents = null,
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState('');
  const { components, addComponent, removeComponent, updateComponent } = useComponentsEditor(
    initialComponents ? cloneComponents(initialComponents) : [makeEmptyComponent()]
  );

  const mutation = useMutation({
    mutationFn: () =>
      api
        .post('/staff/salary-structures', { name, components: componentsPayload(components) })
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-structures'] });
      onOpenChange(false);
    },
    onError: (err) => setError(extractErrorMessage(err, 'Failed to create structure')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initialComponents ? 'Duplicate Salary Structure' : 'New Salary Structure'}
          </DialogTitle>
        </DialogHeader>
        <form
          id="new-salary-structure"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="flex flex-col gap-4"
        >
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <SalaryComponentRows
            components={components}
            onAdd={addComponent}
            onRemove={removeComponent}
            onUpdate={updateComponent}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="new-salary-structure" disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditSalaryStructureModal({ open, onOpenChange, structure }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(structure.name);
  const [error, setError] = useState('');
  const { components, addComponent, removeComponent, updateComponent } = useComponentsEditor(
    (structure.components || []).map((c) => ({
      ...c,
      amount: String(c.amount),
      baseRef: c.baseRef || '',
      // Self-heal for a structure that predates the id-backfill migration —
      // generate an id client-side so editing doesn't hard-fail. Nothing is
      // written until the user saves.
      id: c.id || crypto.randomUUID(),
    }))
  );

  const mutation = useMutation({
    mutationFn: () =>
      api
        .patch(`/staff/salary-structures/${structure._id}`, {
          name,
          components: componentsPayload(components),
        })
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-structures'] });
      onOpenChange(false);
    },
    onError: (err) => setError(extractErrorMessage(err, 'Failed to update structure')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Salary Structure</DialogTitle>
        </DialogHeader>
        <form
          id="edit-salary-structure"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="flex flex-col gap-4"
        >
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <SalaryComponentRows
            components={components}
            onAdd={addComponent}
            onRemove={removeComponent}
            onUpdate={updateComponent}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="edit-salary-structure" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteSalaryStructureModal({ open, onOpenChange, structure }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.delete(`/staff/salary-structures/${structure._id}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-structures'] });
      onOpenChange(false);
    },
    onError: (err) => setError(extractErrorMessage(err, 'Failed to delete structure')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Salary Structure?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This will permanently delete &quot;{structure.name}&quot;. This cannot be undone.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SalaryStructuresPage() {
  const { user } = useAuth();
  // Structure create/edit is gated on tenant:admin (matching the route's
  // actual permission), not payroll:write — accountants get payroll:write
  // but not tenant:admin, so they see this page read-only. Known,
  // intentional gap, not a bug to silently work around.
  const canManage = (user?.permissions ?? []).includes('tenant:admin');

  // null | { mode: 'new' } | { mode: 'duplicate', source }
  const [modalState, setModalState] = useState(null);
  const [editFor, setEditFor] = useState(null);
  const [deleteFor, setDeleteFor] = useState(null);

  const { data: structures = [], isLoading } = useQuery({
    queryKey: ['salary-structures'],
    queryFn: () => api.get('/staff/salary-structures').then((r) => r.data),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Salary Structures"
        action={
          canManage && <Button onClick={() => setModalState({ mode: 'new' })}>New Structure</Button>
        }
      />

      {!canManage && (
        <p className="text-sm text-muted-foreground">
          You have read-only access to salary structures. Creating or editing structures requires
          the tenant administrator role.
        </p>
      )}

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {structures.map((s) => (
          <Card key={s._id} data-testid={`salary-structure-card-${s._id}`}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">{s.name}</CardTitle>
                <Badge variant="outline">{s.staffCount ?? 0} staff</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-1">
                {(s.components || []).map((c, i) => (
                  <li key={c.id ?? i} className="flex justify-between items-center gap-2">
                    <span className="text-muted-foreground flex items-center gap-1">
                      {c.label}
                      <Badge variant={c.type === 'earning' ? 'success' : 'danger'}>{c.type}</Badge>
                    </span>
                    <span className="font-medium">
                      {c.isPercentage
                        ? `${c.amount}% of ${baseRefLabel(s.components, c.baseRef)}`
                        : formatCurrency(c.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
            {canManage && (
              <CardFooter className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditFor(s)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setModalState({ mode: 'duplicate', source: s })}
                >
                  Duplicate
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={(s.staffCount ?? 0) > 0}
                  title={
                    (s.staffCount ?? 0) > 0
                      ? `Cannot delete: ${s.staffCount} staff member(s) assigned`
                      : undefined
                  }
                  onClick={() => setDeleteFor(s)}
                >
                  Delete
                </Button>
              </CardFooter>
            )}
          </Card>
        ))}
        {structures.length === 0 && !isLoading && (
          <p className="text-muted-foreground col-span-3">No salary structures found.</p>
        )}
      </div>

      {modalState && (
        <NewSalaryStructureModal
          open={Boolean(modalState)}
          onOpenChange={(v) => !v && setModalState(null)}
          initialName={modalState.mode === 'duplicate' ? `Copy of ${modalState.source.name}` : ''}
          initialComponents={modalState.mode === 'duplicate' ? modalState.source.components : null}
        />
      )}
      {editFor && (
        <EditSalaryStructureModal
          open={Boolean(editFor)}
          onOpenChange={(v) => !v && setEditFor(null)}
          structure={editFor}
        />
      )}
      {deleteFor && (
        <DeleteSalaryStructureModal
          open={Boolean(deleteFor)}
          onOpenChange={(v) => !v && setDeleteFor(null)}
          structure={deleteFor}
        />
      )}
    </div>
  );
}
