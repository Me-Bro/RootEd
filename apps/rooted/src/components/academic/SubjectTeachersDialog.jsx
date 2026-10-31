import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { Button } from '../ui/Button.jsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog.jsx';
import { useClassSections } from '../../hooks/useClassSections.js';
import { useTeachers } from '../../hooks/useTeachers.js';
import { sectionsForSubject, yearAssignment } from '../../utils/yearAssignment.js';

const EMPTY_ARRAY = [];
const selectCls = 'h-8 min-w-48 rounded-lg border border-input bg-card px-2 text-sm';

/**
 * Who teaches one subject in each section of its class, for the active academic year.
 * Assignments are per year but stored one per term, so a change writes (or clears) the
 * assignment in every term of the year. The same records Catalyst reads.
 */
export default function SubjectTeachersDialog({ subject, onClose }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const { sections: allSections } = useClassSections();
  const sections = sectionsForSubject(subject, allSections);

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
  const termIds = [...terms]
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
    .map((term) => term._id);

  const { staff, isSuccess: staffLoaded } = useTeachers();
  const { data: rows = EMPTY_ARRAY, isLoading } = useQuery({
    queryKey: ['subject-teachers', 'subject', subject._id],
    queryFn: () =>
      api
        .get('/academic/subject-teachers', { params: { subjectId: subject._id } })
        .then((r) => r.data),
  });

  const save = useMutation({
    mutationFn: ({ sectionIds, teacherId }) =>
      Promise.all(
        sectionIds.flatMap((sectionId) =>
          teacherId
            ? termIds.map((termId) =>
                api.put('/academic/subject-teachers', {
                  subjectId: subject._id,
                  sectionId,
                  termId,
                  teacherId,
                })
              )
            : (yearAssignment(rows, sectionId, termIds)?.rows ?? []).map((r) =>
                api.delete(`/academic/subject-teachers/${r._id}`)
              )
        )
      ),
    onMutate: () => setError(''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subject-teachers'] });
      queryClient.invalidateQueries({ queryKey: ['teaching-load'] });
      queryClient.invalidateQueries({ queryKey: ['setup', 'teaching'] });
    },
    onError: (err) => setError(err.response?.data?.error || t('academic.teaching.saveFailed')),
  });

  // No active year means no terms query runs, so that counts as "no terms" too.
  const noTerms = yearsLoaded && (!activeYearId || (termsLoaded && terms.length === 0));
  const ready = !noTerms && sections.length > 0 && staffLoaded && staff.length > 0;

  const teacherOptions = (
    <>
      {staff.map((m) => (
        // Only someone who can sign in may be assigned (the server refuses anyone else),
        // so a staff member without a login is listed but not selectable.
        <option key={m._id} value={m.userId} disabled={m.login === 'none'}>
          {m.login === 'none'
            ? t('academic.subjects.noLoginName', { name: `${m.firstName} ${m.lastName}` })
            : `${m.firstName} ${m.lastName}`}
        </option>
      ))}
    </>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('academic.subjects.teachersTitle', { name: subject.name })}</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">{t('academic.subjects.teachersHint')}</p>

        {noTerms && (
          <p className="text-sm">
            {t('academic.teaching.noTerms')}{' '}
            <Link to="/academic/years" className="font-medium underline">
              {t('academic.teaching.goYears')}
            </Link>
          </p>
        )}
        {!noTerms && allSections.length > 0 && sections.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('academic.subjects.noSections')}</p>
        )}
        {staffLoaded && staff.length === 0 && (
          <p className="text-sm">
            {t('academic.teaching.noStaffHint')}{' '}
            <Link to="/staff" className="font-medium underline">
              {t('academic.teaching.goStaff')}
            </Link>
          </p>
        )}
        {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}

        {ready && !isLoading && (
          <div className="flex flex-col gap-3">
            {sections.length > 1 && (
              <label className="flex items-center justify-between gap-3 text-sm font-medium">
                {t('academic.subjects.sameForAll')}
                <select
                  className={selectCls}
                  value=""
                  disabled={save.isPending}
                  onChange={(e) =>
                    e.target.value &&
                    save.mutate({
                      sectionIds: sections.map((s) => s._id),
                      teacherId: e.target.value,
                    })
                  }
                >
                  <option value="">{t('academic.subjects.pickTeacher')}</option>
                  {teacherOptions}
                </select>
              </label>
            )}
            {sections.map((section) => {
              const current = yearAssignment(rows, section._id, termIds);
              return (
                <label
                  key={section._id}
                  className="flex items-center justify-between gap-3 text-sm"
                  data-testid={`teachers-row-${section.label}`}
                >
                  {section.label}
                  <select
                    aria-label={t('academic.subjects.teacherForSection', {
                      section: section.label,
                    })}
                    className={selectCls}
                    value={current?.teacherId ?? ''}
                    disabled={save.isPending}
                    onChange={(e) =>
                      save.mutate({ sectionIds: [section._id], teacherId: e.target.value })
                    }
                  >
                    <option value="">{t('academic.teaching.notAssigned')}</option>
                    {teacherOptions}
                  </select>
                </label>
              );
            })}
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
