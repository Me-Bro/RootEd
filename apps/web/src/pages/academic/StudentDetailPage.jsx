import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
    { to: 'graduated', labelKey: 'academic.studentDetail.markGraduated' },
    { to: 'withdrawn', labelKey: 'academic.studentDetail.markWithdrawn' },
  ],
  graduated: [{ to: 'active', labelKey: 'academic.studentDetail.reactivate' }],
  withdrawn: [{ to: 'active', labelKey: 'academic.studentDetail.reactivate' }],
};

function EditStudentModal({ open, onOpenChange, student, sections }) {
  const { t } = useTranslation();
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
    onError: (err) =>
      setError(err.response?.data?.error || t('academic.studentDetail.updateFailed')),
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
          <DialogTitle>{t('academic.studentDetail.editModalTitle')}</DialogTitle>
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
            label={t('academic.students.firstName')}
            value={form.firstName}
            onChange={update('firstName')}
            required
          />
          <Input
            label={t('academic.students.lastName')}
            value={form.lastName}
            onChange={update('lastName')}
            required
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{t('academic.students.section')}</label>
            <select value={form.sectionId} onChange={update('sectionId')} className={selectCls}>
              <option value="">{t('academic.students.selectSection')}</option>
              {sections.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <Input
            label={t('academic.students.dateOfBirth')}
            type="date"
            value={form.dateOfBirth}
            onChange={update('dateOfBirth')}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{t('academic.students.gender')}</label>
            <select value={form.gender} onChange={update('gender')} className={selectCls}>
              <option value="">{t('academic.students.selectPlaceholder')}</option>
              <option value="male">{t('academic.students.male')}</option>
              <option value="female">{t('academic.students.female')}</option>
              <option value="other">{t('academic.students.other')}</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">
                {t('academic.studentDetail.parentGuardianContacts')}
              </label>
              <Button type="button" variant="outline" size="sm" onClick={addContact}>
                {t('academic.studentDetail.addContact')}
              </Button>
            </div>
            {form.parentContacts.map((c, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                <Input
                  label={t('common.name')}
                  value={c.name}
                  onChange={updateContact(i, 'name')}
                />
                <Input
                  label={t('academic.studentDetail.phone')}
                  value={c.phone}
                  onChange={updateContact(i, 'phone')}
                />
                <Input
                  label={t('academic.studentDetail.relation')}
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
                  {t('academic.studentDetail.remove')}
                </Button>
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="edit-student" disabled={mutation.isPending}>
            {mutation.isPending ? t('common.saving') : t('academic.studentDetail.saveChanges')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusChangeDialog({ open, onOpenChange, studentId, targetStatus, labelKey }) {
  const { t } = useTranslation();
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
    onError: (err) =>
      setError(err.response?.data?.error || t('academic.studentDetail.updateStatusFailed')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t(labelKey)}?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t('academic.studentDetail.statusChangeDescription')} <strong>{targetStatus}</strong>.
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

function AttendanceSummary({ studentId }) {
  const { t } = useTranslation();
  const { data: records = [], isLoading } = useQuery({
    queryKey: ['student-attendance', studentId],
    queryFn: () => api.get(`/academic/attendance?entityId=${studentId}`).then((r) => r.data),
  });

  if (isLoading)
    return (
      <p className="text-sm text-muted-foreground">
        {t('academic.studentDetail.loadingAttendance')}
      </p>
    );

  const total = records.length;
  const present = records.filter((r) => r.status === 'present' || r.status === 'late').length;
  const pct = total > 0 ? Math.round((present / total) * 100) : null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        {pct === null
          ? t('academic.studentDetail.noAttendanceRecords')
          : t('academic.studentDetail.presentDaysSummary', { pct, present, total })}
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
  const { t } = useTranslation();
  const { data: grades = [], isLoading } = useQuery({
    queryKey: ['student-grades', studentId],
    queryFn: () => api.get(`/academic/grades?studentId=${studentId}`).then((r) => r.data),
  });

  if (isLoading)
    return (
      <p className="text-sm text-muted-foreground">{t('academic.studentDetail.loadingGrades')}</p>
    );
  if (grades.length === 0)
    return (
      <p className="text-sm text-muted-foreground">{t('academic.studentDetail.noGradesYet')}</p>
    );

  return (
    <DataTable
      headers={[
        t('common.subject'),
        t('academic.studentDetail.columnAssessment'),
        t('academic.studentDetail.columnScore'),
        t('academic.studentDetail.columnGrade'),
      ]}
    >
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
  const { t } = useTranslation();
  const { data: assignments = [], isLoading: loadingAssignments } = useQuery({
    queryKey: ['student-fee-assignments', studentId],
    queryFn: () => api.get(`/fee/assignments?studentId=${studentId}`).then((r) => r.data),
  });
  const { data: payments = [], isLoading: loadingPayments } = useQuery({
    queryKey: ['student-fee-payments', studentId],
    queryFn: () => api.get(`/fee/payments?studentId=${studentId}`).then((r) => r.data),
  });

  if (loadingAssignments || loadingPayments)
    return (
      <p className="text-sm text-muted-foreground">{t('academic.studentDetail.loadingFees')}</p>
    );

  const totalDue = assignments.reduce((sum, a) => sum + a.totalAmount - (a.discountAmount || 0), 0);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const balance = totalDue - totalPaid;

  return (
    <div className="flex flex-col gap-1 text-sm">
      <p>{t('academic.studentDetail.totalDue', { amount: totalDue })}</p>
      <p>{t('academic.studentDetail.totalPaid', { amount: totalPaid })}</p>
      <p className={balance > 0 ? 'text-destructive font-medium' : 'text-emerald-600'}>
        {t('academic.studentDetail.balance', { amount: balance })}
      </p>
    </div>
  );
}

export default function StudentDetailPage() {
  const { t } = useTranslation();
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

  if (isLoading)
    return <p className="text-muted-foreground">{t('academic.studentDetail.loadingStudent')}</p>;
  if (error || !student)
    return <p className="text-destructive">{t('academic.studentDetail.loadFailed')}</p>;

  const transitions = STATUS_TRANSITIONS[student.status] ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${student.firstName} ${student.lastName}`}
        description={student.admissionNo}
        action={
          <div className="flex gap-2">
            <Link to="/academic/students">
              <Button variant="outline">{t('academic.studentDetail.backToList')}</Button>
            </Link>
            {canWrite && <Button onClick={() => setShowEdit(true)}>{t('common.edit')}</Button>}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={statusVariant(student.status)}>{student.status}</Badge>
        <span className="text-sm text-muted-foreground">
          {t('academic.studentDetail.sectionLabel', {
            section: sectionMap[student.sectionId] ?? '—',
          })}
        </span>
        {canWrite &&
          transitions.map((transition) => (
            <Button
              key={transition.to}
              variant="outline"
              size="sm"
              onClick={() => setStatusTarget(transition)}
            >
              {t(transition.labelKey)}
            </Button>
          ))}
      </div>

      {student.parentContacts?.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">
            {t('academic.studentDetail.parentGuardianContacts')}
          </h2>
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
            <h2 className="mb-3 text-sm font-semibold">
              {t('academic.studentDetail.attendanceHeading')}
            </h2>
            <AttendanceSummary studentId={id} />
          </div>
        )}
        {permissions.includes('grades:read') && (
          <div className="rounded-lg border border-border p-4">
            <h2 className="mb-3 text-sm font-semibold">
              {t('academic.studentDetail.gradesHeading')}
            </h2>
            <GradesSummary studentId={id} />
          </div>
        )}
        {permissions.includes('fees:read') && (
          <div className="rounded-lg border border-border p-4">
            <h2 className="mb-3 text-sm font-semibold">
              {t('academic.studentDetail.feesHeading')}
            </h2>
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
          labelKey={statusTarget.labelKey}
        />
      )}
    </div>
  );
}
