import { useQuery } from '@tanstack/react-query';
import api from '../lib/api.js';

/**
 * Sections are named just "A"/"B" and repeat across every class (Grade 1-A,
 * Grade 2-A, ...), so any UI that lists sections flat is ambiguous the moment
 * a tenant has more than one class. Fetch classes with their nested sections
 * so callers can group/label sections by class.
 */
export function useClassSections() {
  const { data: classes = [], isLoading } = useQuery({
    queryKey: ['classes-with-sections'],
    queryFn: () => api.get('/academic/classes?includeSections=true').then((r) => r.data),
  });

  const sections = classes.flatMap((c) =>
    (c.sections || []).map((s) => ({ ...s, className: c.name, label: `${c.name} - ${s.name}` }))
  );

  return { classes, sections, isLoading };
}
