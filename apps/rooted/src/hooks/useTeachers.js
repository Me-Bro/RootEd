import { useQuery } from '@tanstack/react-query';
import api from '../lib/api.js';

const EMPTY_ARRAY = [];

/**
 * The one list every teacher picker draws from (Timetable, Classes, Teaching), so they
 * cannot disagree about who a teacher is. `staff` is the people still employed, for
 * choosing from; `nameById` covers everyone, so an assignment to someone who has since
 * left still shows a name. The key sits under ['staff-members'], which adding or editing
 * staff already invalidates.
 */
export function useTeachers() {
  const { data = EMPTY_ARRAY, isSuccess } = useQuery({
    queryKey: ['staff-members', 'teachers'],
    // /staff/members is paginated; the pickers need the whole list, so ask for the max page.
    queryFn: () => api.get('/staff/members?limit=100').then((r) => r.data.members),
  });

  const staff = data.filter((s) => s.userId && s.employmentStatus === 'active');
  const nameById = new Map(data.map((s) => [s.userId, `${s.firstName} ${s.lastName}`]));

  return { staff, nameById, isSuccess };
}
