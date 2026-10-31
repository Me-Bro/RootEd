import { useQuery } from '@tanstack/react-query';
import api from '../lib/api.js';

const EMPTY_ARRAY = [];

/**
 * The sections and subjects a teacher covers this academic year. With no argument it
 * is the signed-in user's own (students:read is enough); another teacher's needs
 * staff:read. A failed read (module off, no permission) just looks like an empty load.
 */
export function useTeachingLoad(teacherId) {
  const { data, isLoading, isSuccess } = useQuery({
    queryKey: ['teaching-load', teacherId ?? 'me'],
    queryFn: () =>
      api
        .get('/academic/teaching-load', { params: teacherId ? { teacherId } : undefined })
        .then((r) => r.data),
    retry: false,
  });
  return { items: data?.items ?? EMPTY_ARRAY, yearId: data?.yearId, isLoading, isSuccess };
}
