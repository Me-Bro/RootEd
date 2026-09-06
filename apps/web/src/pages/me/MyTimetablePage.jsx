import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react';
import api from '../../lib/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { useNow } from '../../hooks/useNow.js';
import WeeklyScheduleGrid from '../../components/academic/WeeklyScheduleGrid.jsx';

// A student's own weekly schedule — same grid as the teacher's My Schedule
// page (see WeeklyScheduleGrid), sourced from the self-scoped /me/timetable
// endpoint instead, which resolves the caller's section server-side and
// never accepts one from the request.
export default function MyTimetablePage() {
  const { t } = useTranslation();
  const now = useNow();

  const { data: timetable = [], isLoading } = useQuery({
    queryKey: ['me', 'timetable'],
    queryFn: () => api.get('/me/timetable').then((r) => r.data),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <PageHeader
          title={t('academic.myTimetable.title')}
          action={
            timetable.length > 0 && (
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

      {isLoading && <p className="text-muted-foreground text-sm">{t('common.loading')}</p>}

      {!isLoading && timetable.length === 0 && (
        <EmptyState
          icon={CalendarDays}
          title={t('academic.mySchedule.emptyTitle')}
          description={t('academic.mySchedule.emptyDescription')}
        />
      )}

      {!isLoading && timetable.length > 0 && (
        <WeeklyScheduleGrid entries={timetable} now={now} linkToAttendance={false} />
      )}
    </div>
  );
}
