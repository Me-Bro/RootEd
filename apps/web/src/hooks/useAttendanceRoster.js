import { useState, useEffect, useMemo, useRef, useDeferredValue } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api.js';

const EMPTY_ARRAY = [];

// Rolls back over Sat/Sun — same rule the seed script's schoolDays() uses —
// so a Monday's "2nd consecutive absence" check compares against Friday, not Sunday.
function previousSchoolDay(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  do {
    d.setDate(d.getDate() - 1);
  } while (d.getDay() === 0 || d.getDay() === 6);
  return d.toISOString().slice(0, 10);
}

function storageKey(sectionId, date) {
  return `attendance:${sectionId}:${date}`;
}

const SORTERS = {
  name: (a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`),
  admissionNo: (a, b) => a.admissionNo.localeCompare(b.admissionNo),
  attendancePct: (a, b) => {
    if (a.pct == null && b.pct == null) return 0;
    if (a.pct == null) return 1; // no history sorts last, never read as a false 0%
    if (b.pct == null) return -1;
    return a.pct - b.pct;
  },
};

export function useAttendanceRoster({ sectionId, date }) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'unmarked' | 'atRisk'
  const [sortBy, setSortBy] = useState('name'); // 'name' | 'admissionNo' | 'attendancePct'
  const [statusMap, setStatusMap] = useState({}); // { [studentId]: { status, note? } }
  const [guardOpen, setGuardOpen] = useState(false);
  const [bulkUndo, setBulkUndo] = useState(null); // { studentIds: string[] } | null

  const initializedKeyRef = useRef(null);
  const deferredSearch = useDeferredValue(searchQuery);

  const {
    data: report,
    isLoading: reportLoading,
    isError: reportError,
  } = useQuery({
    queryKey: ['attendance-report-roster', sectionId],
    queryFn: () =>
      api.get(`/academic/attendance/report?sectionId=${sectionId}`).then((r) => r.data),
    enabled: Boolean(sectionId),
  });

  const roster = report?.students ?? EMPTY_ARRAY;
  const thresholdPct = report?.thresholdPct ?? 75;

  const { data: todayRecords = EMPTY_ARRAY } = useQuery({
    queryKey: ['attendance', sectionId, date],
    queryFn: () =>
      api.get(`/academic/attendance?sectionId=${sectionId}&date=${date}`).then((r) => r.data),
    enabled: Boolean(sectionId && date),
  });

  const prevDate = date ? previousSchoolDay(date) : null;
  const { data: prevDayRecords = EMPTY_ARRAY } = useQuery({
    queryKey: ['attendance', sectionId, prevDate],
    queryFn: () =>
      api.get(`/academic/attendance?sectionId=${sectionId}&date=${prevDate}`).then((r) => r.data),
    enabled: Boolean(sectionId && prevDate),
  });

  const prevAbsentIds = useMemo(
    () => new Set(prevDayRecords.filter((r) => r.status === 'absent').map((r) => r.entityId)),
    [prevDayRecords]
  );

  // Restore in-progress marking from sessionStorage (survives backgrounding mid-roll);
  // otherwise seed from what the server already has saved for this section/date.
  // Runs once per (sectionId, date) so a later manual edit is never clobbered by a refetch.
  useEffect(() => {
    if (!sectionId || !date) return;
    const key = storageKey(sectionId, date);
    if (initializedKeyRef.current === key) return;

    const saved = sessionStorage.getItem(key);
    let initial;
    if (saved) {
      initial = JSON.parse(saved);
    } else {
      initial = {};
      for (const r of todayRecords) {
        initial[r.entityId] = { status: r.status, ...(r.note ? { note: r.note } : {}) };
      }
    }
    setStatusMap(initial);
    initializedKeyRef.current = key;
  }, [sectionId, date, todayRecords]);

  useEffect(() => {
    if (!sectionId || !date) return;
    if (initializedKeyRef.current !== storageKey(sectionId, date)) return;
    sessionStorage.setItem(storageKey(sectionId, date), JSON.stringify(statusMap));
  }, [statusMap, sectionId, date]);

  const rows = useMemo(
    () =>
      roster.map((s) => ({
        ...s,
        current: statusMap[s.studentId],
        secondConsecutiveAbsence:
          statusMap[s.studentId]?.status === 'absent' && prevAbsentIds.has(s.studentId),
      })),
    [roster, statusMap, prevAbsentIds]
  );

  const counts = useMemo(
    () => ({
      all: rows.length,
      unmarked: rows.filter((r) => !r.current).length,
      atRisk: rows.filter((r) => r.isDefaulter).length,
    }),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return rows
      .filter((r) =>
        q
          ? `${r.firstName} ${r.lastName}`.toLowerCase().includes(q) ||
            r.admissionNo.toLowerCase().includes(q)
          : true
      )
      .filter((r) => {
        if (filter === 'unmarked') return !r.current;
        if (filter === 'atRisk') return r.isDefaulter;
        return true;
      })
      .sort(SORTERS[sortBy]);
  }, [rows, deferredSearch, filter, sortBy]);

  const unmarkedRows = useMemo(() => rows.filter((r) => !r.current), [rows]);
  const canSave = rows.length > 0 && rows.every((r) => r.current);

  function setStatus(studentId, status, extra) {
    setStatusMap((prev) => ({ ...prev, [studentId]: { status, ...extra } }));
  }

  function markRestPresent() {
    const unmarkedIds = unmarkedRows.map((r) => r.studentId);
    if (unmarkedIds.length === 0) return; // button stays visible but disabled, never hidden
    setStatusMap((prev) => ({
      ...prev,
      ...Object.fromEntries(unmarkedIds.map((id) => [id, { status: 'present' }])),
    }));
    setBulkUndo({ studentIds: unmarkedIds });
  }

  function undoBulk() {
    if (!bulkUndo) return;
    setStatusMap((prev) => {
      const next = { ...prev };
      bulkUndo.studentIds.forEach((id) => delete next[id]);
      return next;
    });
    setBulkUndo(null);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      api
        .post('/academic/attendance', {
          date,
          sectionId,
          subjectId: null,
          records: rows
            .filter((r) => r.current)
            .map((r) => ({
              entityId: r.studentId,
              status: r.current.status,
              ...(r.current.note ? { note: r.current.note } : {}),
            })),
        })
        .then((r) => r.data),
    onSuccess: () => {
      sessionStorage.removeItem(storageKey(sectionId, date));
      queryClient.invalidateQueries({ queryKey: ['attendance', sectionId, date] });
    },
  });

  function handleSaveTap() {
    if (!canSave) {
      setGuardOpen(true); // never a disabled button with no explanation
      return;
    }
    saveMutation.mutate();
  }

  return {
    reportLoading,
    reportError,
    thresholdPct,
    searchQuery,
    setSearchQuery,
    filter,
    setFilter,
    sortBy,
    setSortBy,
    rows,
    filteredRows,
    unmarkedRows,
    counts,
    canSave,
    guardOpen,
    setGuardOpen,
    bulkUndo,
    setStatus,
    markRestPresent,
    undoBulk,
    handleSaveTap,
    saveMutation,
  };
}
