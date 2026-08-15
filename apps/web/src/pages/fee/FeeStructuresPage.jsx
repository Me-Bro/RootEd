import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../../components/ui/Card.jsx';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';

const selectCls = 'h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

function NewStructureModal({ open, onOpenChange }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [yearId, setYearId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [components, setComponents] = useState([{ label: '', amount: '' }]);
  const [error, setError] = useState('');

  const { data: years = [] } = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => api.get('/academic/years').then((r) => r.data),
  });

  function addComponent() {
    setComponents((prev) => [...prev, { label: '', amount: '' }]);
  }

  function removeComponent(i) {
    setComponents((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateComponent(i, field, value) {
    setComponents((prev) => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  }

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/fee/structures', {
        name,
        academicYearId: yearId,
        dueDate: dueDate || undefined,
        components: components.map((c) => ({ label: c.label, amount: Number(c.amount) })),
      }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fee-structures'] });
      onOpenChange(false);
      setName(''); setYearId(''); setDueDate('');
      setComponents([{ label: '', amount: '' }]);
      setError('');
    },
    onError: (err) => setError(err.response?.data?.error || 'Failed to create'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Fee Structure</DialogTitle>
        </DialogHeader>
        <form id="new-structure" onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="flex flex-col gap-4">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Academic Year</label>
            <select value={yearId} onChange={(e) => setYearId(e.target.value)} required className={selectCls}>
              <option value="">— Select Year —</option>
              {years.map((y) => <option key={y._id} value={y._id}>{y.name}</option>)}
            </select>
          </div>
          <Input label="Due Date (optional)" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Components</span>
              <Button type="button" size="sm" variant="outline" onClick={addComponent}>+ Add Row</Button>
            </div>
            {components.map((c, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input
                  placeholder="Label (e.g. Tuition)"
                  value={c.label}
                  onChange={(e) => updateComponent(i, 'label', e.target.value)}
                  required
                />
                <Input
                  placeholder="Amount"
                  type="number"
                  value={c.amount}
                  onChange={(e) => updateComponent(i, 'amount', e.target.value)}
                  required
                  min="0"
                />
                {components.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeComponent(i)}
                    className="text-destructive hover:text-destructive/80 text-sm px-2 shrink-0"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="new-structure" disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignToSectionModal({ open, onOpenChange, structure }) {
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
    onError: (err) => setError(err.response?.data?.error || 'Assignment failed'),
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
          <DialogTitle>Assign to Section</DialogTitle>
        </DialogHeader>
        {result ? (
          <p className="text-sm text-muted-foreground">
            Done — {result.created} created, {result.skipped} skipped (already assigned).
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Structure: <strong className="text-foreground">{structure?.name}</strong>
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Section</label>
              <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className={selectCls}>
                <option value="">— Select Section —</option>
                {sections.map((s) => (
                  <option key={s._id} value={s._id}>{s.classId?.name} — {s.name}</option>
                ))}
              </select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && (
            <Button onClick={() => mutation.mutate()} disabled={!sectionId || mutation.isPending}>
              {mutation.isPending ? 'Assigning…' : 'Assign'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FeeStructuresPage() {
  const [yearId, setYearId] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [assignFor, setAssignFor] = useState(null);

  const { data: years = [] } = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => api.get('/academic/years').then((r) => r.data),
  });

  const { data: structures = [], isLoading } = useQuery({
    queryKey: ['fee-structures', yearId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (yearId) params.set('yearId', yearId);
      return api.get(`/fee/structures?${params}`).then((r) => r.data);
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Fee Structures"
        action={<Button onClick={() => setShowNew(true)}>New Structure</Button>}
      />

      <div className="flex gap-3">
        <select
          value={yearId}
          onChange={(e) => setYearId(e.target.value)}
          className="h-9 rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">All Years</option>
          {years.map((y) => <option key={y._id} value={y._id}>{y.name}</option>)}
        </select>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {structures.map((s) => (
          <Card key={s._id}>
            <CardHeader>
              <CardTitle className="text-base">{s.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-2">{s.academicYearId?.name}</p>
              <ul className="text-sm space-y-1">
                {(s.components || []).map((c, i) => (
                  <li key={i} className="flex justify-between">
                    <span className="text-muted-foreground">{c.label}</span>
                    <span className="font-medium">{c.amount}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 pt-3 border-t border-border flex justify-between text-sm font-semibold">
                <span>Total</span>
                <span>{(s.components || []).reduce((sum, c) => sum + c.amount, 0)}</span>
              </div>
            </CardContent>
            <CardFooter>
              <Button size="sm" variant="outline" onClick={() => setAssignFor(s)}>
                Assign to Section
              </Button>
            </CardFooter>
          </Card>
        ))}
        {structures.length === 0 && !isLoading && (
          <p className="text-muted-foreground col-span-3">No fee structures found.</p>
        )}
      </div>

      <NewStructureModal open={showNew} onOpenChange={setShowNew} />
      <AssignToSectionModal
        open={Boolean(assignFor)}
        onOpenChange={(v) => !v && setAssignFor(null)}
        structure={assignFor}
      />
    </div>
  );
}
