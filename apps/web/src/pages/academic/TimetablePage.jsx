import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { Button } from '../../components/ui/Button.jsx';
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
import { useClassSections } from '../../hooks/useClassSections.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];
const DAY_TO_NUMBER = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5 };

function AddEntryModal({ open, onOpenChange, sectionId, yearId, day, period }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ teacherId: '', subjectId: '', startTime: '', endTime: '' });
  const [error, setError] = useState('');

  const { data: staff = [] } = useQuery({
    queryKey: ['staff-list'],
    queryFn: () => api.get('/staff/members').then((r) => r.data),
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => api.get('/academic/subjects').then((r) => r.data),
  });

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  const mutation = useMutation({
    mutationFn: () =>
      api
        .post('/academic/timetable', {
          academicYearId: yearId,
          sectionId,
          dayOfWeek: DAY_TO_NUMBER[day],
          periodNumber: period,
          teacherId: form.teacherId,
          subjectId: form.subjectId,
          startTime: form.startTime,
          endTime: form.endTime,
        })
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timetable', sectionId, yearId] });
      onOpenChange(false);
      setForm({ teacherId: '', subjectId: '', startTime: '', endTime: '' });
      setError('');
    },
    onError: (err) => {
      const msg = err.response?.data?.error || 'Failed to add entry';
      setError(err.response?.status === 409 ? 'Teacher has a conflict at this period' : msg);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Add Entry — {day}, Period {period}
          </DialogTitle>
        </DialogHeader>
        <form
          id="add-timetable"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="flex flex-col gap-4"
        >
          <SelectField
            label="Teacher"
            value={form.teacherId}
            onValueChange={(v) => setForm((f) => ({ ...f, teacherId: v }))}
            placeholder="— Select Teacher —"
          >
            {staff.map((s) => (
              <SelectItem key={s._id} value={s._id}>
                {s.firstName} {s.lastName}
              </SelectItem>
            ))}
          </SelectField>
          <SelectField
            label="Subject"
            value={form.subjectId}
            onValueChange={(v) => setForm((f) => ({ ...f, subjectId: v }))}
            placeholder="— Select Subject —"
          >
            {subjects.map((s) => (
              <SelectItem key={s._id} value={s._id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectField>
          <div className="flex gap-3">
            <Input
              label="Start Time"
              type="time"
              value={form.startTime}
              onChange={update('startTime')}
              required
            />
            <Input
              label="End Time"
              type="time"
              value={form.endTime}
              onChange={update('endTime')}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="add-timetable" disabled={mutation.isPending}>
            {mutation.isPending ? 'Adding…' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TimetablePage() {
  const queryClient = useQueryClient();
  const [sectionId, setSectionId] = useState('');
  const [yearId, setYearId] = useState('');
  const [addCell, setAddCell] = useState(null);

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

  const removeMutation = useMutation({
    mutationFn: (id) => api.delete(`/academic/timetable/${id}`).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['timetable', sectionId, yearId] }),
  });

  function cellEntry(day, period) {
    return timetable.find((e) => e.dayOfWeek === DAY_TO_NUMBER[day] && e.periodNumber === period);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Timetable" />

      <div className="flex gap-3 flex-wrap">
        <select
          value={yearId}
          onChange={(e) => setYearId(e.target.value)}
          className="h-9 rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">— Academic Year —</option>
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
          <option value="">— Section —</option>
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
      </div>

      {(!sectionId || !yearId) && (
        <p className="text-muted-foreground text-sm">
          Select an academic year and section to view the timetable.
        </p>
      )}

      {sectionId && yearId && (
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
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-medium text-xs">
                                  {entry.subjectId?.name || '—'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {entry.teacherId?.firstName} {entry.teacherId?.lastName}
                                </p>
                              </div>
                              <button
                                onClick={() => removeMutation.mutate(entry._id)}
                                className="text-destructive/70 hover:text-destructive text-xs shrink-0"
                                title="Remove"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setAddCell({ day, period })}
                              className="text-primary/70 hover:text-primary text-xs font-medium"
                            >
                              + Add
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
      )}

      <AddEntryModal
        open={Boolean(addCell)}
        onOpenChange={(v) => !v && setAddCell(null)}
        sectionId={sectionId}
        yearId={yearId}
        day={addCell?.day}
        period={addCell?.period}
      />
    </div>
  );
}
