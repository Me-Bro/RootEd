import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { DataTable, TableRow, TableCell } from '../../components/ui/DataTable.jsx';

function statusVariant(status) {
  if (status === 'active') return 'success';
  if (status === 'graduated') return 'default';
  if (status === 'withdrawn') return 'danger';
  return 'default';
}

function AddStudentModal({ open, onOpenChange, sections }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    admissionNo: '', firstName: '', lastName: '', sectionId: '', dateOfBirth: '', gender: '',
  });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (data) => api.post('/academic/students', data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      onOpenChange(false);
      setForm({ admissionNo: '', firstName: '', lastName: '', sectionId: '', dateOfBirth: '', gender: '' });
      setError('');
    },
    onError: (err) => setError(err.response?.data?.error || 'Failed to add student'),
  });

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  const selectCls = 'h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Student</DialogTitle>
        </DialogHeader>
        <form
          id="add-student"
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }}
          className="flex flex-col gap-4"
        >
          <Input label="Admission No" value={form.admissionNo} onChange={update('admissionNo')} required />
          <Input label="First Name" value={form.firstName} onChange={update('firstName')} required />
          <Input label="Last Name" value={form.lastName} onChange={update('lastName')} required />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Section</label>
            <select value={form.sectionId} onChange={update('sectionId')} className={selectCls}>
              <option value="">— Select section —</option>
              {sections.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>
          <Input label="Date of Birth" type="date" value={form.dateOfBirth} onChange={update('dateOfBirth')} />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Gender</label>
            <select value={form.gender} onChange={update('gender')} className={selectCls}>
              <option value="">— Select —</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="add-student" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Add Student'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportResultModal({ open, onOpenChange, result }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Results</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-emerald-600 dark:text-emerald-400">Created: {result?.created}</p>
          <p className="text-sm text-amber-600 dark:text-amber-400">Skipped (duplicate): {result?.skipped}</p>
          <p className="text-sm text-destructive">Errors: {result?.errors?.length ?? 0}</p>
          {result?.errors?.length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto rounded border border-destructive/30 p-2 text-xs text-destructive">
              {result.errors.map((e, i) => (
                <p key={i}>{e.reason} — {JSON.stringify(e.row)}</p>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function StudentsPage() {
  const queryClient = useQueryClient();
  const [sectionId, setSectionId] = useState('');
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);

  const { data: sections = [] } = useQuery({
    queryKey: ['sections'],
    queryFn: () => api.get('/academic/sections').then((r) => r.data),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['students', sectionId, page],
    queryFn: () => {
      const params = new URLSearchParams({ page });
      if (sectionId) params.set('sectionId', sectionId);
      return api.get(`/academic/students?${params}`).then((r) => r.data);
    },
  });

  const importMutation = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post('/academic/students/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      setImportResult(result);
    },
  });

  const sectionMap = Object.fromEntries(sections.map((s) => [s._id, s.name]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Students"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importMutation.isPending}>
              {importMutation.isPending ? 'Importing…' : 'Import CSV'}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) importMutation.mutate(e.target.files[0]); e.target.value = ''; }}
            />
            <Button onClick={() => setShowAdd(true)}>Add Student</Button>
          </div>
        }
      />

      <div className="flex gap-3 items-center">
        <select
          value={sectionId}
          onChange={(e) => { setSectionId(e.target.value); setPage(1); }}
          className="h-9 rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">All Sections</option>
          {sections.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
        </select>
      </div>

      {error && <p className="text-destructive">Failed to load students</p>}

      <DataTable
        headers={['Admission No', 'Name', 'Section', 'Status']}
        isLoading={isLoading}
        isEmpty={data?.students?.length === 0}
        emptyMessage="No students found"
      >
        {data?.students?.map((s) => (
          <TableRow key={s._id} className="bg-card">
            <TableCell className="px-4 py-3 font-mono text-xs">{s.admissionNo}</TableCell>
            <TableCell className="px-4 py-3">{s.firstName} {s.lastName}</TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">{sectionMap[s.sectionId] ?? '—'}</TableCell>
            <TableCell className="px-4 py-3">
              <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>

      {data && data.pages > 1 && (
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            Previous
          </Button>
          <span className="text-sm self-center text-muted-foreground">Page {page} of {data.pages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= data.pages}>
            Next
          </Button>
        </div>
      )}

      <AddStudentModal open={showAdd} onOpenChange={setShowAdd} sections={sections} />
      <ImportResultModal open={Boolean(importResult)} onOpenChange={(v) => !v && setImportResult(null)} result={importResult} />
    </div>
  );
}
