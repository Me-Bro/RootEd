import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import SetupGap from '../../components/academic/SetupGap.jsx';
import { useClassSections } from '../../hooks/useClassSections.js';
import { SelectField, SelectItem } from '../../components/ui/SelectField.jsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';

const EMPTY_ARRAY = [];

const memberName = (m) =>
  `${m.userId?.firstName ?? ''} ${m.userId?.lastName ?? ''}`.trim() || m.userId?.email || '';

// Choosing a teacher saves at once; "Not assigned" removes the assignment.
function TeacherRow({ subject, assigned, staff, sectionId, termId }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: (teacherId) =>
      teacherId
        ? api.put('/academic/subject-teachers', {
            subjectId: subject._id,
            sectionId,
            termId,
            teacherId,
          })
        : api.delete(`/academic/subject-teachers/${assigned._id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subject-teachers'] }),
  });

  return (
    <TableRow data-testid={`teaching-row-${subject.code}`}>
      <TableCell className="font-medium">{subject.name}</TableCell>
      <TableCell>{subject.code}</TableCell>
      <TableCell>
        <select
          aria-label={t('academic.teaching.teacherFor', { name: subject.name })}
          className="h-8 min-w-48 rounded-lg border border-input bg-card px-2 text-sm"
          value={assigned?.teacherId ?? ''}
          disabled={save.isPending}
          onChange={(e) => save.mutate(e.target.value)}
        >
          <option value="">{t('academic.teaching.notAssigned')}</option>
          {staff.map((m) => (
            <option key={m.userId._id} value={m.userId._id}>
              {memberName(m)}
            </option>
          ))}
        </select>
        {save.error && (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {save.error.response?.data?.error || t('academic.teaching.saveFailed')}
          </p>
        )}
      </TableCell>
    </TableRow>
  );
}

export default function SubjectTeachersPage() {
  const { t } = useTranslation();
  const [sectionId, setSectionId] = useState('');
  const [termId, setTermId] = useState('');
  const { sections, isLoading: sectionsLoading } = useClassSections();

  // Same active-year scoping as GradesPage, so terms from old years don't pile up.
  const { data: years = EMPTY_ARRAY, isSuccess: yearsLoaded } = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => api.get('/academic/years').then((r) => r.data),
  });
  const activeYearId = years.find((y) => y.isActive)?._id ?? '';
  const { data: terms = EMPTY_ARRAY, isSuccess: termsLoaded } = useQuery({
    queryKey: ['terms', activeYearId],
    queryFn: () => api.get(`/academic/terms?yearId=${activeYearId}`).then((r) => r.data),
    enabled: Boolean(activeYearId),
  });

  const subjects = useQuery({
    queryKey: ['subjects'],
    queryFn: () => api.get('/academic/subjects').then((r) => r.data),
  });
  const team = useQuery({
    queryKey: ['staff-members'],
    queryFn: () =>
      api.get('/tenant/members', { params: { audience: 'staff', limit: 100 } }).then((r) => r.data),
  });
  const ready = Boolean(sectionId && termId);
  const assignments = useQuery({
    queryKey: ['subject-teachers', sectionId, termId],
    queryFn: () =>
      api.get('/academic/subject-teachers', { params: { sectionId, termId } }).then((r) => r.data),
    enabled: ready,
  });

  const staff = (team.data?.members ?? []).filter((m) => m.status === 'active' && m.userId);
  const bySubject = new Map((assignments.data ?? []).map((a) => [a.subjectId, a]));
  const error = subjects.error || team.error || assignments.error;
  // No active year means no terms query runs, so that counts as "no terms" too.
  const noTerms = yearsLoaded && (!activeYearId || (termsLoaded && terms.length === 0));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('academic.teaching.title')}
        description={t('academic.teaching.description')}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label={t('academic.teaching.section')}
          value={sectionId}
          onValueChange={setSectionId}
        >
          {sections.map((s) => (
            <SelectItem key={s._id} value={s._id}>
              {s.label}
            </SelectItem>
          ))}
        </SelectField>
        <SelectField label={t('academic.teaching.term')} value={termId} onValueChange={setTermId}>
          {terms.map((term) => (
            <SelectItem key={term._id} value={term._id}>
              {term.name}
            </SelectItem>
          ))}
        </SelectField>
      </div>

      {noTerms && (
        <EmptyState
          title={t('academic.teaching.noTerms')}
          action={
            <Link to="/academic/years" className="text-sm font-medium underline">
              {t('academic.teaching.goYears')}
            </Link>
          }
        />
      )}
      {!sectionsLoading && sections.length === 0 && <SetupGap gap="sections" />}
      {!ready && !noTerms && sections.length > 0 && (
        <p className="text-sm text-muted-foreground">{t('academic.teaching.pick')}</p>
      )}
      {error && <p className="text-sm text-destructive">{t('academic.teaching.loadError')}</p>}

      {ready && subjects.data?.length === 0 && (
        <EmptyState
          title={t('academic.teaching.noSubjects')}
          action={
            <Link to="/academic/subjects" className="text-sm font-medium underline">
              {t('academic.teaching.goSubjects')}
            </Link>
          }
        />
      )}
      {ready && subjects.data?.length > 0 && team.data && staff.length === 0 && (
        <EmptyState
          title={t('academic.teaching.noStaff')}
          description={t('academic.teaching.noStaffHint')}
          action={
            <Link to="/staff" className="text-sm font-medium underline">
              {t('academic.teaching.goStaff')}
            </Link>
          }
        />
      )}
      {ready && subjects.data?.length > 0 && staff.length > 0 && assignments.data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('common.name')}</TableHead>
              <TableHead>{t('academic.subjects.code')}</TableHead>
              <TableHead>{t('academic.teaching.teacher')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subjects.data.map((s) => (
              <TeacherRow
                key={s._id}
                subject={s}
                assigned={bySubject.get(s._id)}
                staff={staff}
                sectionId={sectionId}
                termId={termId}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
