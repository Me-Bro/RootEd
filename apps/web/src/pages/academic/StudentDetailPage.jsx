import { useState } from 'react';
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
import { DataTable, TableRow, TableCell } from '../../components/ui/DataTable.jsx';
import { useClassSections } from '../../hooks/useClassSections.js';

const selectCls =
  'h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

function statusVariant(status) {
  if (status === 'active') return 'success';
  if (status === 'graduated') return 'default';
  if (status === 'withdrawn') return 'danger';
  return 'default';
}

const STATUS_TRANSITIONS = {
  active: [
    { to: 'graduated', label: 'Mark Graduated' },
    { to: 'withdrawn', label: 'Mark Withdrawn' },
  ],
  graduated: [{ to: 'active', label: 'Reactivate' }],
  withdrawn: [{ to: 'active', label: 'Reactivate' }],
};

function EditStudentModal({ open, onOpenChange, student, sections }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    firstName: student.firstName,
    lastName: student.lastName,
    sectionId: student.sectionId || '',
    dateOfBirth: student.dateOfBirth ? student.dateOfBirth.slice(0, 10) : '',
    gender: student.gender || '',
    parentContacts: student.parentContacts?.length ? student.parentContacts : [],
  });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        sectionId: data.sectionId || undefined,
        dateOfBirth: data.dateOfBirth || undefined,
        gender: data.gender || undefined,
      };
      return api.patch(`/academic/students/${student._id}`, payload).then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student', student._id] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      onOpenChange(false);
      setError('');
    },
    onError: (err) => setError(err.response?.data?.error || 'Failed to update student'),
  });

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function updateContact(index, field) {
    return (e) =>
      setForm((f) => ({
        ...f,
        parentContacts: f.parentContacts.map((c, i) =>
          i === index ? { ...c, [field]: e.target.value } : c
        ),
      }));
  }

  function addContact() {
    setForm((f) => ({
      ...f,
      parentContacts: [...f.parentContacts, { name: '', phone: '', relation: '' }],
    }));
  }

  function removeContact(index) {
    setForm((f) => ({
      ...f,
      parentContacts: f.parentContacts.filter((_, i) => i !== index),
    }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Student</DialogTitle>
        </DialogHeader>
        <form
          id="edit-student"
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
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Section</label>
            <select value={form.sectionId} onChange={update('sectionId')} className={selectCls}>
              <option value="">— Select section —</option>
              {sections.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
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

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Parent / Guardian Contacts</label>
              <Button type="button" variant="outline" size="sm" onClick={addContact}>
                Add Contact
              </Button>
            </div>
            {form.parentContacts.map((c, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                <Input label="Name" value={c.name} onChange={updateContact(i, 'name')} />
                <Input label="Phone" value={c.phone} onChange={updateContact(i, 'phone')} />
                <Input
                  label="Relation"
                  value={c.relation}
                  onChange={updateContact(i, 'relation')}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeContact(i)}
                  className="self-end text-destructive"
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="edit-student" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusChangeDialog({ open, onOpenChange, studentId, targetStatus, label }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/academic/students/${studentId}`, { status: targetStatus }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student', studentId] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
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
          This changes the student&apos;s status to <strong>{targetStatus}</strong>.
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

function AttendanceSummary({ studentId }) {
  const { data: records = [], isLoading } = useQuery({
    queryKey: ['student-attendance', studentId],
    queryFn: () => api.get(`/academic/attendance?entityId=${studentId}`).then((r) => r.data),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading attendance…</p>;

  const total = records.length;
  const present = records.filter((r) => r.status === 'present' || r.status === 'late').length;
  const pct = total > 0 ? Math.round((present / total) * 100) : null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        {pct === null ? 'No attendance records yet.' : `${pct}% present (${present}/${total} days)`}
      </p>
      {records.slice(0, 5).map((r) => (
        <div key={r._id} className="flex justify-between text-sm text-muted-foreground">
          <span>{new Date(r.date).toLocaleDateString()}</span>
          <Badge variant={r.status === 'present' ? 'success' : 'danger'}>{r.status}</Badge>
        </div>
      ))}
    </div>
  );
}

function GradesSummary({ studentId }) {
  const { data: grades = [], isLoading } = useQuery({
    queryKey: ['student-grades', studentId],
    queryFn: () => api.get(`/academic/grades?studentId=${studentId}`).then((r) => r.data),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading grades…</p>;
  if (grades.length === 0) return <p className="text-sm text-muted-foreground">No grades yet.</p>;

  return (
    <DataTable headers={['Subject', 'Assessment', 'Score', 'Grade']}>
      {grades.map((g) => (
        <TableRow key={g._id}>
          <TableCell className="px-4 py-2">{g.subjectId?.name ?? '—'}</TableCell>
          <TableCell className="px-4 py-2 capitalize">{g.assessmentType ?? 'final'}</TableCell>
          <TableCell className="px-4 py-2">{g.score}</TableCell>
          <TableCell className="px-4 py-2">{g.letterGrade}</TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}

function FeeSummary({ studentId }) {
  const { data: assignments = [], isLoading: loadingAssignments } = useQuery({
    queryKey: ['student-fee-assignments', studentId],
    queryFn: () => api.get(`/fee/assignments?studentId=${studentId}`).then((r) => r.data),
  });
  const { data: payments = [], isLoading: loadingPayments } = useQuery({
    queryKey: ['student-fee-payments', studentId],
    queryFn: () => api.get(`/fee/payments?studentId=${studentId}`).then((r) => r.data),
  });

  if (loadingAssignments || loadingPayments)
    return <p className="text-sm text-muted-foreground">Loading fees…</p>;

  const totalDue = assignments.reduce((sum, a) => sum + a.totalAmount - (a.discountAmount || 0), 0);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const balance = totalDue - totalPaid;

  return (
    <div className="flex flex-col gap-1 text-sm">
      <p>Total due: {totalDue}</p>
      <p>Total paid: {totalPaid}</p>
      <p className={balance > 0 ? 'text-destructive font-medium' : 'text-emerald-600'}>
        Balance: {balance}
      </p>
    </div>
  );
}

export default function StudentDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  const [showEdit, setShowEdit] = useState(false);
  const [statusTarget, setStatusTarget] = useState(null);
  const { sections } = useClassSections();

  const {
    data: student,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['student', id],
    queryFn: () => api.get(`/academic/students/${id}`).then((r) => r.data),
  });

  const sectionMap = Object.fromEntries(sections.map((s) => [s._id, s.label]));
  const canWrite = permissions.includes('students:write');

  if (isLoading) return <p className="text-muted-foreground">Loading student…</p>;
  if (error || !student) return <p className="text-destructive">Failed to load student</p>;

  const transitions = STATUS_TRANSITIONS[student.status] ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${student.firstName} ${student.lastName}`}
        description={student.admissionNo}
        action={
          <div className="flex gap-2">
            <Link to="/academic/students">
              <Button variant="outline">Back to list</Button>
            </Link>
            {canWrite && <Button onClick={() => setShowEdit(true)}>Edit</Button>}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={statusVariant(student.status)}>{student.status}</Badge>
        <span className="text-sm text-muted-foreground">
          Section: {sectionMap[student.sectionId] ?? '—'}
        </span>
        {canWrite &&
          transitions.map((t) => (
            <Button key={t.to} variant="outline" size="sm" onClick={() => setStatusTarget(t)}>
              {t.label}
            </Button>
          ))}
      </div>

      {student.parentContacts?.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Parent / Guardian Contacts</h2>
          {student.parentContacts.map((c, i) => (
            <p key={i} className="text-sm text-muted-foreground">
              {c.name} — {c.phone} ({c.relation})
            </p>
          ))}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {permissions.includes('attendance:read') && (
          <div className="rounded-lg border border-border p-4">
            <h2 className="mb-3 text-sm font-semibold">Attendance</h2>
            <AttendanceSummary studentId={id} />
          </div>
        )}
        {permissions.includes('grades:read') && (
          <div className="rounded-lg border border-border p-4">
            <h2 className="mb-3 text-sm font-semibold">Grades</h2>
            <GradesSummary studentId={id} />
          </div>
        )}
        {permissions.includes('fees:read') && (
          <div className="rounded-lg border border-border p-4">
            <h2 className="mb-3 text-sm font-semibold">Fees</h2>
            <FeeSummary studentId={id} />
          </div>
        )}
      </div>

      {showEdit && (
        <EditStudentModal
          open={showEdit}
          onOpenChange={setShowEdit}
          student={student}
          sections={sections}
        />
      )}
      {statusTarget && (
        <StatusChangeDialog
          open={Boolean(statusTarget)}
          onOpenChange={(v) => !v && setStatusTarget(null)}
          studentId={id}
          targetStatus={statusTarget.to}
          label={statusTarget.label}
        />
      )}
    </div>
  );
}
