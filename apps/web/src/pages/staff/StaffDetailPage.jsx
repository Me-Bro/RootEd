import { useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
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

const selectCls =
  'h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

function statusVariant(status) {
  if (status === 'active') return 'success';
  if (status === 'on_leave') return 'warning';
  if (status === 'resigned' || status === 'terminated') return 'danger';
  return 'default';
}

const STAFF_STATUS_TRANSITIONS = {
  active: [
    { to: 'on_leave', label: 'Mark On Leave' },
    { to: 'resigned', label: 'Mark Resigned' },
    { to: 'terminated', label: 'Terminate' },
  ],
  on_leave: [
    { to: 'active', label: 'Mark Active' },
    { to: 'resigned', label: 'Mark Resigned' },
    { to: 'terminated', label: 'Terminate' },
  ],
  resigned: [{ to: 'active', label: 'Reactivate' }],
  terminated: [{ to: 'active', label: 'Reactivate' }],
};

function EditStaffModal({ open, onOpenChange, staff }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    firstName: staff.firstName || '',
    lastName: staff.lastName || '',
    employeeId: staff.employeeId || '',
    designation: staff.designation || '',
    department: staff.department || '',
    phone: staff.phone || '',
    address: staff.address || '',
    dateOfBirth: staff.dateOfBirth ? staff.dateOfBirth.slice(0, 10) : '',
    gender: staff.gender || '',
  });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (data) => api.patch(`/staff/members/${staff._id}`, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-member', staff._id] });
      queryClient.invalidateQueries({ queryKey: ['staff-members'] });
      onOpenChange(false);
      setError('');
    },
    onError: (err) => setError(err.response?.data?.error || 'Failed to update staff member'),
  });

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Staff Member</DialogTitle>
        </DialogHeader>
        <form
          id="edit-staff"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(form);
          }}
          className="flex flex-col gap-4"
        >
          <Input
            label="First Name"
            value={form.firstName}
            onChange={update('firstName')}
            required
          />
          <Input label="Last Name" value={form.lastName} onChange={update('lastName')} required />
          <Input label="Employee ID" value={form.employeeId} onChange={update('employeeId')} />
          <Input label="Designation" value={form.designation} onChange={update('designation')} />
          <Input label="Department" value={form.department} onChange={update('department')} />
          <Input label="Phone" value={form.phone} onChange={update('phone')} />
          <Input label="Address" value={form.address} onChange={update('address')} />
          <Input
            label="Date of Birth"
            type="date"
            value={form.dateOfBirth}
            onChange={update('dateOfBirth')}
          />
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="edit-staff" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusChangeDialog({ open, onOpenChange, staffId, targetStatus, label }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api
        .patch(`/staff/members/${staffId}`, { employmentStatus: targetStatus })
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-member', staffId] });
      queryClient.invalidateQueries({ queryKey: ['staff-members'] });
      onOpenChange(false);
      setError('');
    },
    onError: (err) => setError(err.response?.data?.error || 'Failed to update status'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{label}?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This changes the staff member&apos;s status to <strong>{targetStatus}</strong>.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentsPanel({ staff, canWrite }) {
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const [error, setError] = useState('');

  const uploadMutation = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', file.name);
      return api
        .post(`/staff/members/${staff._id}/documents`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-member', staff._id] });
      setError('');
    },
    onError: (err) => setError(err.response?.data?.error || 'Failed to upload document'),
  });

  async function download(index) {
    setError('');
    try {
      const { data } = await api.get(`/staff/members/${staff._id}/documents/${index}/download`);
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to get document link');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {staff.documents?.length > 0 ? (
        staff.documents.map((doc, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span>{doc.name}</span>
            <Button variant="outline" size="sm" onClick={() => download(i)}>
              Download
            </Button>
          </div>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">No documents uploaded.</p>
      )}
      {canWrite && (
        <>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) uploadMutation.mutate(e.target.files[0]);
              e.target.value = '';
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="self-start mt-1"
            onClick={() => fileRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            {uploadMutation.isPending ? 'Uploading…' : 'Upload Document'}
          </Button>
        </>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export default function StaffDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  const canWrite = permissions.includes('staff:write');
  const [showEdit, setShowEdit] = useState(false);
  const [statusTarget, setStatusTarget] = useState(null);

  const {
    data: staff,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['staff-member', id],
    queryFn: () => api.get(`/staff/members/${id}`).then((r) => r.data),
  });

  if (isLoading) return <p className="text-muted-foreground">Loading staff member…</p>;
  if (error || !staff) return <p className="text-destructive">Failed to load staff member</p>;

  const transitions = STAFF_STATUS_TRANSITIONS[staff.employmentStatus] ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${staff.firstName} ${staff.lastName}`}
        description={staff.employeeId}
        action={
          <div className="flex gap-2">
            <Link to="/staff">
              <Button variant="outline">Back to list</Button>
            </Link>
            {canWrite && <Button onClick={() => setShowEdit(true)}>Edit</Button>}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={statusVariant(staff.employmentStatus)}>{staff.employmentStatus}</Badge>
        <span className="text-sm text-muted-foreground">
          {staff.designation || '—'} · {staff.department || '—'}
        </span>
        {canWrite &&
          transitions.map((t) => (
            <Button key={t.to} variant="outline" size="sm" onClick={() => setStatusTarget(t)}>
              {t.label}
            </Button>
          ))}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-4">
          <h2 className="mb-3 text-sm font-semibold">Profile</h2>
          <div className="flex flex-col gap-1 text-sm">
            <p>Phone: {staff.phone || '—'}</p>
            <p>Address: {staff.address || '—'}</p>
            <p>
              Date of Birth:{' '}
              {staff.dateOfBirth ? new Date(staff.dateOfBirth).toLocaleDateString() : '—'}
            </p>
            <p>Gender: {staff.gender || '—'}</p>
            <p>
              Joining Date:{' '}
              {staff.joiningDate ? new Date(staff.joiningDate).toLocaleDateString() : '—'}
            </p>
            {canWrite && (
              <>
                <p>Government ID: {staff.governmentId || '—'}</p>
                <p>Bank Account: {staff.bankAccount || '—'}</p>
              </>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border p-4">
          <h2 className="mb-3 text-sm font-semibold">Documents</h2>
          <DocumentsPanel staff={staff} canWrite={canWrite} />
        </div>
      </div>

      {showEdit && <EditStaffModal open={showEdit} onOpenChange={setShowEdit} staff={staff} />}
      {statusTarget && (
        <StatusChangeDialog
          open={Boolean(statusTarget)}
          onOpenChange={(v) => !v && setStatusTarget(null)}
          staffId={id}
          targetStatus={statusTarget.to}
          label={statusTarget.label}
        />
      )}
    </div>
  );
}
