import { useState } from 'react';
import { useForm } from 'react-hook-form';
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
  if (status === 'on_leave') return 'warning';
  if (status === 'resigned' || status === 'terminated') return 'danger';
  return 'default';
}

const STEPS = ['Basic Info', 'Contact', 'Review'];

function AddStaffModal({ open, onOpenChange }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');

  const { register, handleSubmit, getValues, formState: { errors } } = useForm({
    defaultValues: {
      firstName: '', lastName: '', employeeId: '', designation: '', department: '', joiningDate: '',
      phone: '', address: '', dateOfBirth: '', gender: '',
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
              {Object.entries(getValues()).map(([k, v]) => v ? (
                <div key={k} className="flex justify-between border-b border-border py-1">
                  <span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                  <span className="font-medium">{v}</span>
                </div>
              ) : null)}
            </div>
          )}

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

          <DialogFooter className="mt-4">
            <Button variant="outline" type="button" onClick={step === 0 ? () => onOpenChange(false) : () => setStep((s) => s - 1)}>
              {step === 0 ? 'Cancel' : 'Back'}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={() => setStep((s) => s + 1)}>Next</Button>
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

export default function StaffPage() {
  const [department, setDepartment] = useState('');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const { data: members = [], isLoading, error } = useQuery({
    queryKey: ['staff-members', department, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (department) params.set('department', department);
      if (search) params.set('search', search);
      return api.get(`/staff/members?${params}`).then((r) => r.data);
    },
  });

  const departments = [...new Set(members.map((m) => m.department).filter(Boolean))];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Staff Directory"
        action={<Button onClick={() => setShowAdd(true)}>Add Staff</Button>}
      />

      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Search by name or employee ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="h-9 rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">All Departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
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
            <TableCell className="px-4 py-3">{m.firstName} {m.lastName}</TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">{m.designation || '—'}</TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">{m.department || '—'}</TableCell>
            <TableCell className="px-4 py-3">
              <Badge variant={statusVariant(m.employmentStatus)}>{m.employmentStatus}</Badge>
            </TableCell>
            <TableCell className="px-4 py-3">
              <Button variant="outline" size="sm">View</Button>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>

      <AddStaffModal open={showAdd} onOpenChange={setShowAdd} />
    </div>
  );
}
