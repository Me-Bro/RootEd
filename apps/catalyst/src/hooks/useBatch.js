import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import api from '@/lib/api.js';

/**
 * Which batch (a Section) and programme run (a Term) the page is looking at.
 *
 * The choice lives in the URL (?section=…&term=…) so a page can be reloaded or
 * shared. Sections are named just "A"/"B" and repeat across every class, so they
 * are always labelled with their class.
 */
export function useBatch() {
  const [params, setParams] = useSearchParams();

  const classesQuery = useQuery({
    queryKey: ['classes-with-sections'],
    queryFn: () => api.get('/academic/classes?includeSections=true').then((r) => r.data),
  });
  const termsQuery = useQuery({
    queryKey: ['terms'],
    queryFn: () => api.get('/academic/terms').then((r) => r.data),
  });

  const sections = useMemo(
    () =>
      (classesQuery.data ?? []).flatMap((c) =>
        (c.sections ?? []).map((s) => ({ ...s, label: `${c.name} — ${s.name}` }))
      ),
    [classesQuery.data]
  );
  const terms = termsQuery.data ?? [];

  const sectionId = params.get('section') || sections[0]?._id || '';
  // Terms arrive oldest first; the latest is the programme run people are working in.
  const termId = params.get('term') || terms[terms.length - 1]?._id || '';

  const set = (key) => (value) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  return {
    sections,
    terms,
    sectionId,
    termId,
    setSectionId: set('section'),
    setTermId: set('term'),
    ready: Boolean(sectionId && termId),
    loading: classesQuery.isLoading || termsQuery.isLoading,
    error: classesQuery.error || termsQuery.error,
  };
}
