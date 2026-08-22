import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';

const PAGE_SIZE = 20;
// Fallback delay for the "scroll sentinel never triggered" edge case (slow
// network / sentinel briefly out of view) — see spec §5.
const MANUAL_LOAD_FALLBACK_MS = 3000;

function initials(firstName, lastName) {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();
}

function statusVariant(status) {
  if (status === 'active') return 'success';
  if (status === 'graduated') return 'default';
  if (status === 'withdrawn') return 'danger';
  return 'default';
}

/**
 * Roster for one section (or a flat search result set), loaded 20 at a time
 * and appended on scroll — replaces the old "Page X of 50" pager.
 *
 * Spec (§4) lists this component's contract as `{ sectionId }`. It's
 * extended here with an optional `search` prop so the header search can
 * reuse the same infinite-scroll + sentinel + manual-fallback logic for its
 * flat result list (§5: "Search active — results render as a flat infinite
 * list") instead of duplicating that logic in the page component.
 */
export default function RosterInfiniteList({ sectionId, search }) {
  const mode = search ? 'search' : 'section';
  const key = mode === 'search' ? search : sectionId;

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['students', mode, key],
      queryFn: ({ pageParam = 1 }) => {
        const params = new URLSearchParams({ page: pageParam, limit: PAGE_SIZE });
        if (mode === 'search') params.set('search', search);
        else params.set('sectionId', sectionId);
        return api.get(`/academic/students?${params}`).then((r) => r.data);
      },
      getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
      enabled: Boolean(key),
    });

  const students = data?.pages.flatMap((p) => p.students) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  const [manualLoadVisible, setManualLoadVisible] = useState(false);
  const sentinelRef = useRef(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional resync: rearm the fallback watchdog whenever the page count changes
    setManualLoadVisible(false);
    if (!hasNextPage || isFetchingNextPage) return undefined;
    const timer = setTimeout(() => setManualLoadVisible(true), MANUAL_LOAD_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [hasNextPage, isFetchingNextPage, students.length]);

  useEffect(() => {
    if (!hasNextPage) return undefined;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, students.length]);

  if (isLoading) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Loading students…</p>;
  }

  if (isError) {
    return (
      <p className="py-6 text-center text-sm text-destructive">
        Failed to load students — check your connection and try again.
      </p>
    );
  }

  if (students.length === 0) {
    return (
      <EmptyState
        title={
          mode === 'search' ? 'No students match your search' : 'No students in this section yet'
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-xs text-muted-foreground">
        {total} student{total === 1 ? '' : 's'}
      </p>
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {students.map((s) => (
          <Link
            key={s._id}
            to={`/academic/students/${s._id}`}
            className="flex items-center gap-3 p-3 hover:bg-muted"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
              {initials(s.firstName, s.lastName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {s.firstName} {s.lastName}
              </p>
              <p className="font-mono text-xs text-muted-foreground">{s.admissionNo}</p>
            </div>
            <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
          </Link>
        ))}
      </div>

      {hasNextPage && (
        <div ref={sentinelRef} className="flex justify-center py-3">
          {isFetchingNextPage ? (
            <span className="text-xs text-muted-foreground">Loading more…</span>
          ) : manualLoadVisible ? (
            <Button variant="outline" size="sm" onClick={() => fetchNextPage()}>
              Load more
            </Button>
          ) : (
            <span aria-hidden="true">&nbsp;</span>
          )}
        </div>
      )}
    </div>
  );
}
