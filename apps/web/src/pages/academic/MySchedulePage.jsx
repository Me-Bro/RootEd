import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { useAuth } from '../../contexts/useAuth.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];
const DAY_TO_NUMBER = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5 };

export default function MySchedulePage() {
  const { user } = useAuth();
  const [yearId, setYearId] = useState('');

  const { data: years = [] } = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => api.get('/academic/years').then((r) => r.data),
  });

  const { data: timetable = [], isLoading } = useQuery({
    queryKey: ['timetable', 'my-schedule', user?._id, yearId],
    queryFn: () =>
      api.get(`/academic/timetable?teacherId=${user._id}&yearId=${yearId}`).then((r) => r.data),
    enabled: Boolean(user?._id) && Boolean(yearId),
  });

  function cellEntry(day, period) {
    return timetable.find((e) => e.dayOfWeek === DAY_TO_NUMBER[day] && e.periodNumber === period);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="My Schedule" />

      <select
        value={yearId}
        onChange={(e) => setYearId(e.target.value)}
        className="h-9 w-fit rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <option value="">— Academic Year —</option>
        {years.map((y) => (
          <option key={y._id} value={y._id}>
            {y.name}
          </option>
        ))}
      </select>

      {!yearId && (
        <p className="text-muted-foreground text-sm">
          Select an academic year to view your schedule.
        </p>
      )}

      {yearId && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground w-16">
                  Period
                </th>
                {DAYS.map((d) => (
                  <th key={d} className="px-4 py-3 text-left font-medium text-muted-foreground">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : (
                PERIODS.map((period) => (
                  <tr key={period} className="bg-card">
                    <td className="px-4 py-3 font-medium text-muted-foreground">{period}</td>
                    {DAYS.map((day) => {
                      const entry = cellEntry(day, period);
                      return (
                        <td key={day} className="px-4 py-3 border-l border-border">
                          {entry ? (
                            <div>
                              <p className="font-medium text-xs">
                                {entry.sectionId?.name || '—'} · {entry.subjectId?.name || '—'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {entry.startTime}–{entry.endTime}
                                {entry.room ? ` · ${entry.room}` : ''}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
