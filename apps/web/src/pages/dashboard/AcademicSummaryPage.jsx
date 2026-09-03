import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import api from '../../lib/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card, CardContent } from '../../components/ui/Card.jsx';
import { Progress, ProgressTrack, ProgressIndicator } from '../../components/ui/progress.jsx';

function todayParam() {
  return new Date().toISOString().slice(0, 10);
}

export default function AcademicSummaryPage() {
  const { t } = useTranslation();
  const today = todayParam();

  const { data: totalStudents = 0 } = useQuery({
    queryKey: ['academic', 'students', 'count'],
    queryFn: () =>
      api
        .get('/academic/students', { params: { limit: 1, status: 'active' } })
        .then((r) => r.data.total ?? 0),
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ['academic', 'attendance', today, 'student'],
    queryFn: () =>
      api
        .get('/academic/attendance', { params: { date: today, entityType: 'student' } })
        .then((r) => r.data),
  });

  const { data: gradesSummary } = useQuery({
    queryKey: ['academic', 'grades', 'summary'],
    queryFn: () => api.get('/academic/grades/summary').then((r) => r.data),
  });

  const present = attendance.filter((r) => r.status === 'present').length;
  const absent = attendance.filter((r) => r.status === 'absent').length;
  const late = attendance.filter((r) => r.status === 'late').length;
  const excused = attendance.filter((r) => r.status === 'excused').length;
  const attendancePct = attendance.length
    ? Math.round(((present + late) / attendance.length) * 1000) / 10
    : null;

  const distribution = gradesSummary?.distribution ?? { A: 0, B: 0, C: 0, D: 0, F: 0 };
  const failingCount = distribution.F;

  return (
    <div className="flex flex-col gap-5">
      <Link to="/dashboard" className="text-sm text-muted-foreground hover:underline w-fit">
        {t('common.backToDashboard')}
      </Link>
      <PageHeader title={t('dashboard.academicSummary.title')} />

      <Card>
        <CardContent className="pt-4">
          <p className="text-sm font-medium text-muted-foreground">
            {t('dashboard.academicSummary.attendanceCard')}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground">
              {attendancePct !== null ? `${attendancePct}%` : '—'}
            </span>
            <span className="text-sm text-muted-foreground">
              {t('dashboard.academicSummary.studentsSuffix', { count: totalStudents })}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center text-sm">
            <div>
              <p className="font-semibold text-green-700 dark:text-green-500">{present}</p>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.academicSummary.presentLabel')}
              </p>
            </div>
            <div>
              <p className="font-semibold text-destructive">{absent}</p>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.academicSummary.absentLabel')}
              </p>
            </div>
            <div>
              <p className="font-semibold text-yellow-700 dark:text-yellow-500">{late}</p>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.academicSummary.lateLabel')}
              </p>
            </div>
            <div>
              <p className="font-semibold text-blue-700 dark:text-blue-400">{excused}</p>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.academicSummary.excusedLabel')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <p className="text-sm font-medium text-muted-foreground">
            {t('dashboard.academicSummary.gradeCard')}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground">
              {gradesSummary?.classAverageScore != null
                ? `${gradesSummary.classAverageScore}%`
                : '—'}
            </span>
            <span className="text-sm text-muted-foreground">
              {t('dashboard.academicSummary.avgScoreLabel')}
              {gradesSummary &&
                ` · ${t('dashboard.academicSummary.entriesLabel', { count: gradesSummary.rankedCount })}`}
            </span>
          </div>
          <div className="mt-3 space-y-1.5">
            {['A', 'B', 'C', 'D', 'F'].map((letter) => (
              <div key={letter} className="flex items-center gap-2">
                <span className="w-4 text-xs font-medium text-muted-foreground">{letter}</span>
                <Progress
                  value={
                    gradesSummary?.rankedCount
                      ? (distribution[letter] / gradesSummary.rankedCount) * 100
                      : 0
                  }
                  className="flex-1"
                >
                  <ProgressTrack>
                    <ProgressIndicator
                      className={letter === 'F' ? 'bg-destructive' : 'bg-primary'}
                    />
                  </ProgressTrack>
                </Progress>
                <span className="w-8 text-right text-xs text-muted-foreground">
                  {distribution[letter]}
                </span>
              </div>
            ))}
          </div>
          {failingCount > 0 && (
            <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {t('dashboard.academicSummary.failingAlert', { count: failingCount })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 text-sm">
        <Link to="/academic/attendance/report" className="text-primary hover:underline">
          {t('dashboard.academicSummary.viewAttendanceReport')} ›
        </Link>
        <Link to="/academic/grades/report" className="text-primary hover:underline">
          {t('dashboard.academicSummary.viewGradeReport')} ›
        </Link>
      </div>
    </div>
  );
}
