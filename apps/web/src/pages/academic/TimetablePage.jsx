import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { cn } from '../../lib/utils.js';
import { Button } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Input } from '../../components/ui/Input.jsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { SelectField, SelectItem } from '../../components/ui/SelectField.jsx';
import { DaySlotList } from '../../components/timetable/DaySlotList.jsx';
import { useClassSections } from '../../hooks/useClassSections.js';
import { useAuth } from '../../contexts/useAuth.js';
import { isCurrentPeriodCell } from '../../utils/scheduleHighlight.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];
const DAY_TO_NUMBER = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5 };
const EMPTY_FORM = { teacherId: '', subjectId: '', startTime: '', endTime: '', room: '' };

function defaultActiveDay() {
  const today = new Date().getDay(); // 0=Sun..6=Sat, matches dayOfWeek 1-5 for Mon-Fri
  return today >= 1 && today <= 5 ? today : 1;
}

function EntryModal({ open, onOpenChange, sectionId, yearId, day, period, entry }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isEdit = Boolean(entry);
  const [form, setForm] = useState(() =>
    entry
      ? {
          teacherId: entry.teacherId?._id ?? entry.teacherId,
          subjectId: entry.subjectId?._id ?? entry.subjectId,
          startTime: entry.startTime,
          endTime: entry.endTime,
          room: entry.room ?? '',
        }
      : EMPTY_FORM
  );
  const [error, setError] = useState('');

  const { data: staff = [] } = useQuery({
    queryKey: ['staff-list'],
    // /staff/members is paginated ({ members, total, page, pages }) — the
    // teacher picker needs the full list, so request the server's max page
    // size rather than the default 20.
    queryFn: () => api.get('/staff/members?limit=100').then((r) => r.data.members),
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => api.get('/academic/subjects').then((r) => r.data),
  });

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function resetAndClose() {
    onOpenChange(false);
    setForm(EMPTY_FORM);
    setError('');
  }

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        academicYearId: yearId,
        sectionId,
        dayOfWeek: DAY_TO_NUMBER[day],
        periodNumber: period,
        teacherId: form.teacherId,
        subjectId: form.subjectId,
        startTime: form.startTime,
        endTime: form.endTime,
        room: form.room || undefined,
      };
      return isEdit
        ? api.put(`/academic/timetable/${entry._id}`, body).then((r) => r.data)
        : api.post('/academic/timetable', body).then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timetable', sectionId, yearId] });
      resetAndClose();
    },
    onError: (err) => {
      setError(
        err.response?.data?.error ||
          t(isEdit ? 'academic.timetable.updateEntryFailed' : 'academic.timetable.addEntryFailed')
      );
    },
  });

  const dayLabel = t(`common.weekdays.${day?.toLowerCase()}`);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && resetAndClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(isEdit ? 'academic.timetable.editEntryTitle' : 'academic.timetable.addEntryTitle', {
              day: dayLabel,
              period,
            })}
          </DialogTitle>
        </DialogHeader>
        <form
          id="timetable-entry-form"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="flex flex-col gap-4"
        >
          <SelectField
            label={t('academic.timetable.teacher')}
            value={form.teacherId}
            onValueChange={(v) => setForm((f) => ({ ...f, teacherId: v }))}
            placeholder={t('academic.timetable.selectTeacherPlaceholder')}
          >
            {staff.map((s) => (
              <SelectItem key={s._id} value={s.userId}>
                {s.firstName} {s.lastName}
              </SelectItem>
            ))}
          </SelectField>
          <SelectField
            label={t('common.subject')}
            value={form.subjectId}
            onValueChange={(v) => setForm((f) => ({ ...f, subjectId: v }))}
            placeholder={t('academic.timetable.selectSubjectPlaceholder')}
          >
            {subjects.map((s) => (
              <SelectItem key={s._id} value={s._id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectField>
          <div className="flex gap-3">
            <Input
              label={t('academic.timetable.startTime')}
              type="time"
              value={form.startTime}
              onChange={update('startTime')}
              required
            />
            <Input
              label={t('academic.timetable.endTime')}
              type="time"
              value={form.endTime}
              onChange={update('endTime')}
              required
            />
          </div>
          <Input
            label={t('academic.timetable.roomOptional')}
            type="text"
            value={form.room}
            onChange={update('room')}
            placeholder={t('academic.timetable.roomPlaceholder')}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="timetable-entry-form" disabled={mutation.isPending}>
            {mutation.isPending
              ? t('common.saving')
              : isEdit
                ? t('common.save')
                : t('academic.timetable.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyModal({ open, onOpenChange, sectionId, yearId, years }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [fromYearId, setFromYearId] = useState('');
  const [result, setResult] = useState(null);

  const mutation = useMutation({
    mutationFn: () =>
      api
        .post('/academic/timetable/copy', { sectionId, fromYearId, toYearId: yearId })
        .then((r) => r.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['timetable', sectionId, yearId] });
      setResult(data);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setFromYearId('');
          setResult(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('academic.timetable.copyModalTitle')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <SelectField
            label={t('academic.timetable.sourceAcademicYear')}
            value={fromYearId}
            onValueChange={setFromYearId}
            placeholder={t('academic.timetable.selectYearPlaceholder')}
          >
            {years
              .filter((y) => y._id !== yearId)
              .map((y) => (
                <SelectItem key={y._id} value={y._id}>
                  {y.name}
                </SelectItem>
              ))}
          </SelectField>
          {result && (
            <p className="text-sm text-muted-foreground">
              {t('academic.timetable.copyResult', {
                copied: result.copied,
                skipped: result.skipped,
              })}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!fromYearId || mutation.isPending}>
            {mutation.isPending ? t('academic.timetable.copying') : t('academic.timetable.copy')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TimetablePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = (user?.permissions ?? []).includes('tenant:admin');

  const [searchParams] = useSearchParams();
  const [sectionId, setSectionId] = useState(() => searchParams.get('sectionId') || '');
  const [yearId, setYearId] = useState(() => searchParams.get('yearId') || '');
  const [entryCell, setEntryCell] = useState(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [activeDay, setActiveDay] = useState(defaultActiveDay);

  const { data: years = [] } = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => api.get('/academic/years').then((r) => r.data),
  });

  const { classes } = useClassSections();

  const { data: timetable = [], isLoading } = useQuery({
    queryKey: ['timetable', sectionId, yearId],
    queryFn: () =>
      sectionId
        ? api.get(`/academic/timetable?sectionId=${sectionId}&yearId=${yearId}`).then((r) => r.data)
        : Promise.resolve([]),
    enabled: Boolean(sectionId) && Boolean(yearId),
  });

  const { data: publishStatus } = useQuery({
    queryKey: ['timetable-publish', sectionId, yearId],
    queryFn: () =>
      api
        .get(`/academic/timetable/publish?academicYearId=${yearId}&sectionId=${sectionId}`)
        .then((r) => r.data),
    enabled: Boolean(sectionId) && Boolean(yearId),
  });
  const published = Boolean(publishStatus?.published);

  const publishMutation = useMutation({
    mutationFn: (action) =>
      api
        .post(`/academic/timetable/${action}`, { academicYearId: yearId, sectionId })
        .then((r) => r.data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['timetable-publish', sectionId, yearId] }),
  });

  const removeMutation = useMutation({
    mutationFn: (id) => api.delete(`/academic/timetable/${id}`).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['timetable', sectionId, yearId] }),
  });

  function cellEntry(day, period) {
    return timetable.find((e) => e.dayOfWeek === DAY_TO_NUMBER[day] && e.periodNumber === period);
  }

  // Mobile day-chip view (docs/mobile-ui/07-timetable-approved.html §3) — day
  // chips replace the grid; the desktop grid (and its per-slot editing) is
  // unchanged and still renders at md+ widths.
  const daySlots = timetable
    .filter((e) => e.dayOfWeek === activeDay)
    .sort((a, b) => a.periodNumber - b.periodNumber);
  const isNowFn = (slot) => isCurrentPeriodCell(DAYS[activeDay - 1], slot);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageHeader title={t('academic.timetable.title')} />
        {sectionId && yearId && isAdmin && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setCopyOpen(true)}>
              {t('academic.timetable.copyFromAnotherYear')}
            </Button>
            <Button
              variant={published ? 'outline' : 'default'}
              onClick={() => publishMutation.mutate(published ? 'unpublish' : 'publish')}
              disabled={publishMutation.isPending}
            >
              {published
                ? t('academic.timetable.unpublishAction')
                : t('academic.timetable.publishAction')}
            </Button>
          </div>
        )}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <select
          value={yearId}
          onChange={(e) => setYearId(e.target.value)}
          className="h-9 rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">{t('academic.timetable.academicYearPlaceholder')}</option>
          {years.map((y) => (
            <option key={y._id} value={y._id}>
              {y.name}
            </option>
          ))}
        </select>
        <select
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value)}
          className="h-9 rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">{t('academic.timetable.sectionPlaceholder')}</option>
          {classes.map((c) => (
            <optgroup key={c._id} label={c.name}>
              {(c.sections || []).map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {sectionId && yearId && (
          <Badge variant={published ? 'success' : 'warning'}>
            {published
              ? t('academic.timetable.publishedStatus')
              : t('academic.timetable.draftStatus')}
          </Badge>
        )}
      </div>

      {(!sectionId || !yearId) && (
        <p className="text-muted-foreground text-sm">
          {t('academic.timetable.selectYearSectionPrompt')}
        </p>
      )}

      {sectionId && yearId && (
        <>
          {/* Mobile: day chips + vertical period list (approved mock 2) — read-only, zero
              horizontal scroll. Editing stays on the desktop grid below. */}
          <div className="flex flex-col gap-3 md:hidden">
            <div
              role="tablist"
              aria-label={t('academic.timetable.dayOfWeekLabel')}
              className="grid grid-cols-5 gap-1 rounded-lg bg-muted p-1"
            >
              {DAYS.map((day, idx) => {
                const dayNum = idx + 1;
                const active = activeDay === dayNum;
                return (
                  <button
                    key={day}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveDay(dayNum)}
                    className={cn(
                      'rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                      active
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {t(`common.weekdays.${day.toLowerCase()}`).slice(0, 3)}
                  </button>
                );
              })}
            </div>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            ) : (
              <DaySlotList slots={daySlots} activeDay={activeDay} isNowFn={isNowFn} />
            )}
          </div>

          {/* Desktop: 8x5 grid, unchanged — per-slot add/edit/remove for admins. */}
          <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground w-16">
                    {t('academic.timetable.period')}
                  </th>
                  {DAYS.map((d) => (
                    <th key={d} className="px-4 py-3 text-left font-medium text-muted-foreground">
                      {t(`common.weekdays.${d.toLowerCase()}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                      {t('common.loading')}
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
                              <div className="flex items-start justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEntryCell({ day, period, entry })}
                                  className="text-left"
                                  title={t('common.edit')}
                                >
                                  <p className="font-medium text-xs">
                                    {entry.subjectId?.name || '—'}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {entry.teacher?.firstName} {entry.teacher?.lastName}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {entry.startTime}–{entry.endTime}
                                    {entry.room ? ` · ${entry.room}` : ''}
                                  </p>
                                </button>
                                <button
                                  onClick={() => removeMutation.mutate(entry._id)}
                                  className="text-destructive/70 hover:text-destructive text-xs shrink-0"
                                  title={t('academic.studentDetail.remove')}
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setEntryCell({ day, period })}
                                className="text-primary/70 hover:text-primary text-xs font-medium"
                              >
                                {t('academic.timetable.addShort')}
                              </button>
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
        </>
      )}

      <EntryModal
        key={
          entryCell
            ? `${entryCell.entry?._id ?? 'new'}-${entryCell.day}-${entryCell.period}`
            : 'closed'
        }
        open={Boolean(entryCell)}
        onOpenChange={(v) => !v && setEntryCell(null)}
        sectionId={sectionId}
        yearId={yearId}
        day={entryCell?.day}
        period={entryCell?.period}
        entry={entryCell?.entry}
      />

      <CopyModal
        open={copyOpen}
        onOpenChange={setCopyOpen}
        sectionId={sectionId}
        yearId={yearId}
        years={years}
      />
    </div>
  );
}
