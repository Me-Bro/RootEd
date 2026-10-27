import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api.js';
import { memberName } from '@/lib/people.js';
import { useBatch } from '@/hooks/useBatch.js';
import { BatchGate, BatchPicker } from '@/components/BatchPicker.jsx';
import { PageHeader } from '@/components/ui/PageHeader.jsx';
import { Card, CardContent } from '@/components/ui/Card.jsx';
import { EmptyState, ErrorNote, Spinner } from '@/components/ui/Feedback.jsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table.jsx';

function TeacherRow({ subject, assigned, staff, batch }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Choosing a teacher saves at once; "Not assigned" removes the row.
  const save = useMutation({
    mutationFn: (teacherId) =>
      teacherId
        ? api.put('/academic/subject-teachers', {
            subjectId: subject._id,
            sectionId: batch.sectionId,
            termId: batch.termId,
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
          aria-label={t('teaching.teacherFor', { name: subject.name })}
          className="h-8 min-w-48 rounded-lg border border-input bg-card px-2 text-sm"
          value={assigned?.teacherId ?? ''}
          disabled={save.isPending}
          onChange={(e) => save.mutate(e.target.value)}
        >
          <option value="">{t('teaching.notAssigned')}</option>
          {staff.map((m) => (
            <option key={m.userId._id} value={m.userId._id}>
              {memberName(m)}
            </option>
          ))}
        </select>
        {save.error && <ErrorNote error={save.error} />}
      </TableCell>
    </TableRow>
  );
}

export default function TeachingPage() {
  const { t } = useTranslation();
  const batch = useBatch();

  const subjects = useQuery({
    queryKey: ['subjects'],
    queryFn: () => api.get('/academic/subjects').then((r) => r.data),
  });
  // Same key and call as the Team page, so the list is shared between them.
  const team = useQuery({
    queryKey: ['people-team'],
    queryFn: () =>
      api.get('/tenant/members', { params: { audience: 'staff', limit: 100 } }).then((r) => r.data),
  });
  const assignments = useQuery({
    queryKey: ['subject-teachers', batch.sectionId, batch.termId],
    queryFn: () =>
      api
        .get('/academic/subject-teachers', {
          params: { sectionId: batch.sectionId, termId: batch.termId },
        })
        .then((r) => r.data),
    enabled: batch.ready,
  });

  const staff = (team.data?.members ?? []).filter((m) => m.status === 'active' && m.userId);
  const bySubject = new Map((assignments.data ?? []).map((a) => [a.subjectId, a]));
  const loading = subjects.isLoading || team.isLoading || assignments.isLoading;
  const error = subjects.error || team.error || assignments.error;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('teaching.title')} description={t('teaching.description')} />
      <BatchGate batch={batch}>
        <BatchPicker batch={batch} />
        {loading && <Spinner />}
        {error && <ErrorNote error={error} />}
        {subjects.data?.length === 0 && (
          <EmptyState
            title={t('teaching.noSubjects')}
            action={
              <Link to="/setup" className="text-sm font-medium underline">
                {t('setup.goSetup')}
              </Link>
            }
          />
        )}
        {subjects.data?.length > 0 && team.data && staff.length === 0 && (
          <EmptyState
            title={t('teaching.noStaff')}
            action={
              <Link to="/people/team" className="text-sm font-medium underline">
                {t('teaching.goTeam')}
              </Link>
            }
          />
        )}
        {subjects.data?.length > 0 && staff.length > 0 && assignments.data && (
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('setup.name')}</TableHead>
                    <TableHead>{t('setup.code')}</TableHead>
                    <TableHead>{t('teaching.teacher')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subjects.data.map((s) => (
                    <TeacherRow
                      key={s._id}
                      subject={s}
                      assigned={bySubject.get(s._id)}
                      staff={staff}
                      batch={batch}
                    />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </BatchGate>
    </div>
  );
}
