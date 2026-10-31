import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { useAuth } from '../../contexts/useAuth.js';

const EMPTY_ARRAY = [];

/**
 * The subjects taught to one section and who teaches each, from the assignments
 * (assignments are per year, stored per term, so a subject can appear once per term and
 * is listed once here). Each subject opens its grades when the viewer may read them.
 */
export default function SectionTeachersCard({ sectionId }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canOpenGrades = (user?.permissions ?? []).includes('grades:read');

  const { data: rows = EMPTY_ARRAY, isLoading } = useQuery({
    queryKey: ['subject-teachers', sectionId],
    queryFn: () =>
      api.get('/academic/subject-teachers', { params: { sectionId } }).then((r) => r.data),
    enabled: Boolean(sectionId),
  });
  const { data: subjects = EMPTY_ARRAY } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => api.get('/academic/subjects').then((r) => r.data),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;

  const subjectName = new Map(subjects.map((s) => [s._id, s.name]));
  const bySubject = new Map();
  for (const row of rows) if (!bySubject.has(row.subjectId)) bySubject.set(row.subjectId, row);

  if (!bySubject.size) {
    return (
      <p className="text-sm text-muted-foreground">{t('academic.studentDetail.subjectsEmpty')}</p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5 text-sm" data-testid="section-teachers">
      {[...bySubject.values()].map((row) => {
        const name = subjectName.get(row.subjectId) ?? '—';
        const teacher =
          `${row.teacher?.firstName ?? ''} ${row.teacher?.lastName ?? ''}`.trim() ||
          row.teacher?.email ||
          '—';
        return (
          <li key={row.subjectId} className="flex justify-between gap-2">
            {canOpenGrades ? (
              <Link
                to={`/academic/grades?sectionId=${sectionId}&subjectId=${row.subjectId}`}
                className="hover:underline"
              >
                {name}
              </Link>
            ) : (
              <span>{name}</span>
            )}
            <span className="text-muted-foreground">{teacher}</span>
          </li>
        );
      })}
    </ul>
  );
}
