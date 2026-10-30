import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { DataTable, TableRow, TableCell } from '../../components/ui/DataTable.jsx';

export default function MyGradesPage() {
  const { t } = useTranslation();

  const { data: grades = [], isLoading } = useQuery({
    queryKey: ['me', 'grades'],
    queryFn: () => api.get('/me/grades').then((r) => r.data),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('academic.myGrades.title')} description={t('academic.myGrades.note')} />

      <DataTable
        headers={[
          t('common.subject'),
          t('academic.studentDetail.columnAssessment'),
          t('academic.studentDetail.columnScore'),
          t('academic.studentDetail.columnGrade'),
        ]}
        isLoading={isLoading}
        isEmpty={!isLoading && grades.length === 0}
        emptyMessage={t('academic.studentDetail.noGradesYet')}
      >
        {grades.map((g) => (
          <TableRow key={g._id}>
            <TableCell className="px-4 py-2">{g.subject?.name ?? '—'}</TableCell>
            <TableCell className="px-4 py-2 capitalize">{g.assessmentType ?? 'final'}</TableCell>
            <TableCell className="px-4 py-2">{g.score}</TableCell>
            <TableCell className="px-4 py-2">{g.letterGrade}</TableCell>
          </TableRow>
        ))}
      </DataTable>
    </div>
  );
}
