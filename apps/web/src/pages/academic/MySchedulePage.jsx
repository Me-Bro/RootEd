import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react';
import api from '../../lib/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { useAuth } from '../../contexts/useAuth.js';
import { useNow } from '../../hooks/useNow.js';
import WeeklyScheduleGrid from '../../components/academic/WeeklyScheduleGrid.jsx';

export default function MySchedulePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const now = useNow();
  const [yearId, setYearId] = useState('');

  const { data: years = [] } = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => api.get('/academic/years').then((r) => r.data),
  });

  const activeYearId = years.find((y) => y.isActive)?._id ?? '';
  const effectiveYearId = yearId || activeYearId;

  const { data: timetable = [], isLoading } = useQuery({
    queryKey: ['timetable', 'my-schedule', user?._id, effectiveYearId],
    queryFn: () =>
      api
        .get(`/academic/timetable?teacherId=${user._id}&yearId=${effectiveYearId}`)
        .then((r) => r.data),
    enabled: Boolean(user?._id) && Boolean(effectiveYearId),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <PageHeader
          title={t('academic.mySchedule.title')}
          action={
            effectiveYearId && (
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => window.print()}
              >
                {t('academic.mySchedule.print')}
              </Button>
            )
          }
        />
      </div>

      <select
        value={effectiveYearId}
        onChange={(e) => setYearId(e.target.value)}
        className="h-9 w-fit rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 print:hidden"
      >
        <option value="">{t('academic.timetable.academicYearPlaceholder')}</option>
        {years.map((y) => (
          <option key={y._id} value={y._id}>
            {y.name}
          </option>
        ))}
      </select>

      {!effectiveYearId && (
        <p className="text-muted-foreground text-sm">{t('academic.mySchedule.selectYearPrompt')}</p>
      )}

      {effectiveYearId && isLoading && (
        <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
      )}

      {effectiveYearId && !isLoading && timetable.length === 0 && (
        <EmptyState
          icon={CalendarDays}
          title={t('academic.mySchedule.emptyTitle')}
          description={t('academic.mySchedule.emptyDescription')}
        />
      )}

      {effectiveYearId && !isLoading && timetable.length > 0 && (
        <WeeklyScheduleGrid entries={timetable} now={now} linkToAttendance />
      )}
    </div>
  );
}
