import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronDown, Zap } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
} from '../../components/ui/dropdown-menu.jsx';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet.jsx';
import { useClassSections } from '../../hooks/useClassSections.js';
import { useAttendanceRoster } from '../../hooks/useAttendanceRoster.js';
import SearchField from '../../components/attendance/SearchField.jsx';
import FilterChips from '../../components/attendance/FilterChips.jsx';
import SortMenu from '../../components/attendance/SortMenu.jsx';
import StatusPills from '../../components/attendance/StatusPills.jsx';
import UnmarkedGuardSheet from '../../components/attendance/UnmarkedGuardSheet.jsx';
import BulkUndoToast from '../../components/attendance/BulkUndoToast.jsx';

function initials(firstName, lastName) {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();
}

function PctBadge({ pct }) {
  if (pct == null) return <span className="text-xs text-muted-foreground">no history</span>;
  return (
    <span
      className={
        pct < 75 ? 'text-xs font-semibold text-destructive' : 'text-xs text-muted-foreground'
      }
    >
      {pct}%
    </span>
  );
}

export default function AttendancePage() {
  const [searchParams] = useSearchParams();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sectionId, setSectionId] = useState(() => searchParams.get('sectionId') || '');
  const [moreSheetFor, setMoreSheetFor] = useState(null); // studentId | null

  const { classes } = useClassSections();
  const currentSection = classes
    .flatMap((c) => (c.sections || []).map((s) => ({ ...s, className: c.name })))
    .find((s) => s._id === sectionId);

  const {
    reportLoading,
    reportError,
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
    guardOpen,
    setGuardOpen,
    bulkUndo,
    setStatus,
    markRestPresent,
    undoBulk,
    handleSaveTap,
    saveMutation,
  } = useAttendanceRoster({ sectionId, date });

  const statusCounts = rows.reduce(
    (acc, r) => {
      const s = r.current?.status;
      if (s) acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    },
    { present: 0, absent: 0, late: 0, excused: 0 }
  );
  const markedCount = rows.length - counts.unmarked;

  const moreSheetRow = rows.find((r) => r.studentId === moreSheetFor);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Attendance</h1>
          {currentSection && (
            <p className="text-sm text-muted-foreground">
              {currentSection.className} - {currentSection.name}
            </p>
          )}
        </div>
        {sectionId && (
          <Link
            to={`/academic/attendance/report?sectionId=${sectionId}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            View Report →
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium">
            {currentSection
              ? `${currentSection.className}-${currentSection.name}`
              : 'Select section'}
            <ChevronDown size={14} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {classes.map((c) => (
              <DropdownMenuGroup key={c._id}>
                <DropdownMenuLabel>{c.name}</DropdownMenuLabel>
                {(c.sections || []).map((s) => (
                  <DropdownMenuItem key={s._id} onClick={() => setSectionId(s._id)}>
                    {c.name} - {s.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />

        {rows.length > 0 && (
          <span className="text-xs text-muted-foreground">{rows.length} students</span>
        )}
      </div>

      {!sectionId && <EmptyState title="Select a section to mark attendance" />}

      {sectionId && reportError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Attendance % unavailable — retry. Marking is still available below.
        </div>
      )}

      {sectionId && !reportLoading && rows.length === 0 && (
        <EmptyState title="No active students in this section." />
      )}

      {sectionId && rows.length > 0 && (
        <>
          <SearchField value={searchQuery} onChange={setSearchQuery} />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <FilterChips value={filter} onChange={setFilter} counts={counts} />
            <SortMenu value={sortBy} onChange={setSortBy} />
          </div>

          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">
                Marked {markedCount} of {rows.length}
              </span>
              <div className="flex gap-1.5">
                <Badge variant="success">{statusCounts.present} P</Badge>
                <Badge variant="danger">{statusCounts.absent} A</Badge>
                <Badge variant="warning">{statusCounts.late} L</Badge>
              </div>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${rows.length ? (markedCount / rows.length) * 100 : 0}%` }}
              />
            </div>
          </div>

          {filteredRows.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No student matches &lsquo;{searchQuery}&rsquo;
            </p>
          )}

          <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {filteredRows.map((r) => (
              <div key={r.studentId} className="flex items-center gap-3 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  {initials(r.firstName, r.lastName)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {r.firstName} {r.lastName}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="font-mono">{r.admissionNo}</span>
                    <span>·</span>
                    <PctBadge pct={r.pct} />
                    {r.secondConsecutiveAbsence && (
                      <>
                        <span>·</span>
                        <span className="font-medium text-destructive">2nd day absent</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="w-40">
                  <StatusPills
                    status={r.current?.status}
                    onSet={(status) => setStatus(r.studentId, status)}
                    onOpenMore={() => setMoreSheetFor(r.studentId)}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {sectionId && rows.length > 0 && (
        <div className="sticky bottom-0 z-10 -mx-6 border-t border-border bg-card p-3">
          {bulkUndo && (
            <div className="mb-2">
              <BulkUndoToast
                count={bulkUndo.studentIds.length}
                onUndo={undoBulk}
                onExpire={undoBulk}
              />
            </div>
          )}
          {saveMutation.isError && (
            <p className="mb-2 text-center text-sm text-destructive">
              Failed to save attendance — nothing was lost, tap Save to retry.
            </p>
          )}
          <div className="mx-auto flex max-w-3xl gap-2">
            <Button
              variant="outline"
              className="gap-1.5"
              disabled={counts.unmarked === 0}
              onClick={markRestPresent}
            >
              <Zap size={14} />
              Mark rest present
            </Button>
            <Button className="flex-1" onClick={handleSaveTap} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : `Save · ${markedCount} of ${rows.length}`}
            </Button>
          </div>
        </div>
      )}

      <UnmarkedGuardSheet
        open={guardOpen}
        unmarkedRows={unmarkedRows}
        onSet={setStatus}
        onMarkAllPresent={() => {
          markRestPresent();
          setGuardOpen(false);
        }}
        onClose={() => setGuardOpen(false)}
      />

      <Sheet open={Boolean(moreSheetFor)} onOpenChange={(next) => !next && setMoreSheetFor(null)}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>
              {moreSheetRow ? `${moreSheetRow.firstName} ${moreSheetRow.lastName}` : ''}
            </SheetTitle>
          </SheetHeader>
          <div className="flex gap-2 px-4 pb-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setStatus(moreSheetFor, 'late', { note: new Date().toTimeString().slice(0, 5) });
                setMoreSheetFor(null);
              }}
            >
              Late
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setStatus(moreSheetFor, 'excused');
                setMoreSheetFor(null);
              }}
            >
              Excused
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
