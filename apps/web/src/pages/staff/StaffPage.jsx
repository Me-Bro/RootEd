import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { useAuth } from '../../contexts/useAuth.js';
import { Badge } from '../../components/ui/Badge.jsx';
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
import { DataTable, TableRow, TableCell } from '../../components/ui/DataTable.jsx';

const selectCls =
  'h-9 rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

function statusVariant(status) {
  if (status === 'active') return 'success';
  if (status === 'on_leave') return 'warning';
  if (status === 'resigned' || status === 'terminated') return 'danger';
  return 'default';
}

const STEPS = ['Basic Info', 'Contact', 'Review'];

function AddStaffModal({ open, onOpenChange }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');

  const { register, handleSubmit, getValues } = useForm({
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
      employeeId: '',
      designation: '',
      department: '',
      joiningDate: '',
      phone: '',
      address: '',
      dateOfBirth: '',
      gender: '',
    },
  });

  const mutation = useMutation({
    mutationFn: (data) => api.post('/staff/members', data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-members'] });
      onOpenChange(false);
      setStep(0);
      setError('');
    },
    onError: (err) => setError(err.response?.data?.error || 'Failed to add staff member'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Staff Member — {STEPS[step]}</DialogTitle>
          <div className="flex gap-2 mt-1">
            {STEPS.map((s, i) => (
              <span
                key={s}
                className={[
                  'text-xs px-2 py-0.5 rounded-full font-medium',
                  i === step
                    ? 'bg-primary text-primary-foreground'
                    : i < step
                      ? 'bg-muted text-foreground'
                      : 'bg-muted text-muted-foreground',
                ].join(' ')}
              >
                {s}
              </span>
            ))}
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit((data) => mutation.mutate(data))}>
          {step === 0 && (
            <div className="flex flex-col gap-4">
              <Input label="Email" type="email" {...register('email', { required: true })} />
              <Input label="First Name" {...register('firstName', { required: true })} />
              <Input label="Last Name" {...register('lastName', { required: true })} />
              <Input label="Employee ID" {...register('employeeId')} />
              <Input label="Designation" {...register('designation')} />
              <Input label="Department" {...register('department')} />
              <Input label="Joining Date" type="date" {...register('joiningDate')} />
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <Input label="Phone" {...register('phone')} />
              <Input label="Address" {...register('address')} />
              <Input label="Date of Birth" type="date" {...register('dateOfBirth')} />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Gender</label>
                <select
                  {...register('gender')}
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="">— Select —</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-2 text-sm">
              <p className="font-medium text-muted-foreground">Review Details</p>
              {Object.entries(getValues()).map(([k, v]) =>
                v ? (
                  <div key={k} className="flex justify-between border-b border-border py-1">
                    <span className="text-muted-foreground capitalize">
                      {k.replace(/([A-Z])/g, ' $1')}
                    </span>
                    <span className="font-medium">{v}</span>
                  </div>
                ) : null
              )}
            </div>
          )}

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              type="button"
              onClick={step === 0 ? () => onOpenChange(false) : () => setStep((s) => s - 1)}
            >
              {step === 0 ? 'Cancel' : 'Back'}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button
                type="button"
                onClick={(e) => {
                  // The button occupying this footer slot becomes a
                  // type="submit" Submit button once this click advances to
                  // the last step — React swaps the type synchronously
                  // during this same click, and the browser's native
                  // default-action check (which runs after React's render)
                  // then sees "submit" and fires the form early. Suppress
                  // that default action explicitly rather than relying on
                  // type="button" alone.
                  e.preventDefault();
                  setStep((s) => s + 1);
                }}
              >
                Next
              </Button>
            ) : (
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving…' : 'Submit'}
              </Button>
            )}
          </DialogFooter>
        </form>
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
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            Created: {result?.created}
          </p>
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Skipped (duplicate): {result?.skipped}
          </p>
          <p className="text-sm text-destructive">Errors: {result?.errors?.length ?? 0}</p>
          {result?.errors?.length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto rounded border border-destructive/30 p-2 text-xs text-destructive">
              {result.errors.map((e, i) => (
                <p key={i}>
                  {e.reason} — {JSON.stringify(e.row)}
                </p>
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

export default function StaffPage() {
  const { user } = useAuth();
  const canWrite = (user?.permissions ?? []).includes('staff:write');
  const queryClient = useQueryClient();

  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['staff-members', department, status, search, page],
    queryFn: () => {
      const params = new URLSearchParams({ page });
      if (department) params.set('department', department);
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      return api.get(`/staff/members?${params}`).then((r) => r.data);
    },
  });

  const importMutation = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('file', file);
      return api
        .post('/staff/members/import', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then((r) => r.data);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['staff-members'] });
      setImportResult(result);
    },
  });

  const members = data?.members ?? [];
  const departments = [...new Set(members.map((m) => m.department).filter(Boolean))];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Staff Directory"
        action={
          canWrite && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={importMutation.isPending}
              >
                {importMutation.isPending ? 'Importing…' : 'Import CSV'}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) importMutation.mutate(e.target.files[0]);
                  e.target.value = '';
                }}
              />
              <Button onClick={() => setShowAdd(true)}>Add Staff</Button>
            </div>
          )
        }
      />

      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Search by name or employee ID…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={department}
          onChange={(e) => {
            setDepartment(e.target.value);
            setPage(1);
          }}
          className={selectCls}
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className={selectCls}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="on_leave">On Leave</option>
          <option value="resigned">Resigned</option>
          <option value="terminated">Terminated</option>
        </select>
      </div>

      {error && <p className="text-destructive">Failed to load staff</p>}

      <DataTable
        headers={['Employee ID', 'Name', 'Designation', 'Department', 'Status', 'Actions']}
        isLoading={isLoading}
        isEmpty={members.length === 0}
        emptyMessage="No staff members found"
      >
        {members.map((m) => (
          <TableRow key={m._id} className="bg-card">
            <TableCell className="px-4 py-3 font-mono text-xs">{m.employeeId || '—'}</TableCell>
            <TableCell className="px-4 py-3">
              <Link to={`/staff/${m._id}`} className="hover:underline">
                {m.firstName} {m.lastName}
              </Link>
            </TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">
              {m.designation || '—'}
            </TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">{m.department || '—'}</TableCell>
            <TableCell className="px-4 py-3">
              <Badge variant={statusVariant(m.employmentStatus)}>{m.employmentStatus}</Badge>
            </TableCell>
            <TableCell className="px-4 py-3">
              <Link to={`/staff/${m._id}`}>
                <Button variant="outline" size="sm">
                  View
                </Button>
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>

      {data && data.pages > 1 && (
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </Button>
          <span className="text-sm self-center text-muted-foreground">
            Page {page} of {data.pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= data.pages}
          >
            Next
          </Button>
        </div>
      )}

      <AddStaffModal open={showAdd} onOpenChange={setShowAdd} />
      <ImportResultModal
        open={Boolean(importResult)}
        onOpenChange={(v) => !v && setImportResult(null)}
        result={importResult}
      />
    </div>
  );
}
