import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
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
import { useClassSections } from '../../hooks/useClassSections.js';
import SearchField from '../../components/attendance/SearchField.jsx';
import ClassGrid from '../../components/students/ClassGrid.jsx';
import SectionChips from '../../components/students/SectionChips.jsx';
import RosterInfiniteList from '../../components/students/RosterInfiniteList.jsx';

const LAST_SECTION_KEY = 'students:lastSectionId';

function AddStudentModal({ open, onOpenChange, sections }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    admissionNo: '',
    firstName: '',
    lastName: '',
    sectionId: '',
    dateOfBirth: '',
    gender: '',
  });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (data) => api.post('/academic/students', data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      onOpenChange(false);
      setForm({
        admissionNo: '',
        firstName: '',
        lastName: '',
        sectionId: '',
        dateOfBirth: '',
        gender: '',
      });
      setError('');
    },
    onError: (err) => setError(err.response?.data?.error || 'Failed to add student'),
  });

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  const selectCls =
    'h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Student</DialogTitle>
        </DialogHeader>
        <form
          id="add-student"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(form);
          }}
          className="flex flex-col gap-4"
        >
          <Input
            label="Admission No"
            value={form.admissionNo}
            onChange={update('admissionNo')}
            required
          />
          <Input
            label="First Name"
            value={form.firstName}
            onChange={update('firstName')}
            required
          />
          <Input label="Last Name" value={form.lastName} onChange={update('lastName')} required />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Section</label>
            <select value={form.sectionId} onChange={update('sectionId')} className={selectCls}>
              <option value="">— Select section —</option>
              {sections.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Date of Birth"
            type="date"
            value={form.dateOfBirth}
            onChange={update('dateOfBirth')}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Gender</label>
            <select value={form.gender} onChange={update('gender')} className={selectCls}>
              <option value="">— Select —</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="add-student" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Add Student'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportResultModal({ open, onOpenChange, result }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Results</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            Created: {result?.created}
          </p>
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Skipped (duplicate): {result?.skipped}
          </p>
          <p className="text-sm text-destructive">Errors: {result?.errors?.length ?? 0}</p>
          {result?.errors?.length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto rounded border border-destructive/30 p-2 text-xs text-destructive">
              {result.errors.map((e, i) => (
                <p key={i}>
                  {e.reason} — {JSON.stringify(e.row)}
                </p>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function StudentsPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [showAdd, setShowAdd] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const fileRef = useRef(null);

  // Class drill-down state (replaces the 40-option section <select>). The
  // initial section prefers an explicit ?sectionId= (Playwright/deep-links),
  // falling back to the last section this device viewed — "pre-opened next
  // visit" per the spec's Definition of Done.
  const [drillSectionId, setDrillSectionId] = useState(() => {
    try {
      return searchParams.get('sectionId') || localStorage.getItem(LAST_SECTION_KEY) || null;
    } catch {
      return searchParams.get('sectionId') || null;
    }
  });
  const [drillClassId, setDrillClassId] = useState(null);
  const [lastUsedSectionId, setLastUsedSectionId] = useState(drillSectionId);

  const { classes, sections } = useClassSections();
  const sectionsById = Object.fromEntries(sections.map((s) => [s._id, s]));

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Resolve which class owns the initially-restored section, once classes load.
  useEffect(() => {
    if (!drillSectionId || drillClassId || classes.length === 0) return;
    const owner = classes.find((c) => (c.sections || []).some((s) => s._id === drillSectionId));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time resync once class data (an external source) finishes loading
    if (owner) setDrillClassId(owner._id);
  }, [drillSectionId, drillClassId, classes]);

  useEffect(() => {
    if (!drillSectionId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional resync: mirror the active selection into the persisted "last used" bookmark
    setLastUsedSectionId(drillSectionId);
    try {
      localStorage.setItem(LAST_SECTION_KEY, drillSectionId);
    } catch {
      // localStorage unavailable (private mode, etc.) — remembering across
      // visits is a nicety, not a hard requirement, so fail silently.
    }
  }, [drillSectionId]);

  const importMutation = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('file', file);
      return api
        .post('/academic/students/import', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then((r) => r.data);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      setImportResult(result);
    },
  });

  function handleExpandClass(classId) {
    const opening = classId !== drillClassId;
    setDrillClassId(opening ? classId : null);
    if (opening) {
      const ownerClassId = drillSectionId ? sectionsById[drillSectionId]?.classId : null;
      if (ownerClassId !== classId) {
        setDrillSectionId(null);
      }
    }
  }

  function jumpToLastUsed() {
    const sec = sectionsById[lastUsedSectionId];
    if (!sec) return;
    setDrillClassId(sec.classId ?? null);
    setDrillSectionId(sec._id);
  }

  const expandedClass = classes.find((c) => c._id === drillClassId) || null;
  const lastUsedSection = lastUsedSectionId ? sectionsById[lastUsedSectionId] : null;
  const showRecentlyUsed = Boolean(
    !search && lastUsedSection && lastUsedSectionId !== drillSectionId
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Students"
        description="Pick a class, or search for a student directly."
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={importMutation.isPending}
            >
              {importMutation.isPending ? 'Importing…' : 'Import CSV'}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) importMutation.mutate(e.target.files[0]);
                e.target.value = '';
              }}
            />
            <Button onClick={() => setShowAdd(true)}>Add Student</Button>
          </div>
        }
      />

      <SearchField value={searchInput} onChange={setSearchInput} />

      {search ? (
        <RosterInfiniteList search={search} />
      ) : (
        <div className="flex flex-col gap-4">
          {showRecentlyUsed && (
            <button
              type="button"
              onClick={jumpToLastUsed}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted"
            >
              <div>
                <p className="text-xs font-medium text-muted-foreground">Recently used</p>
                <p className="text-sm font-medium">{lastUsedSection.label}</p>
              </div>
              <ArrowRight size={16} className="shrink-0 text-muted-foreground" />
            </button>
          )}

          <ClassGrid classes={classes} expandedId={drillClassId} onExpand={handleExpandClass} />

          {expandedClass && (
            <SectionChips
              sections={expandedClass.sections || []}
              activeId={drillSectionId}
              onSelect={setDrillSectionId}
            />
          )}

          {drillSectionId && <RosterInfiniteList sectionId={drillSectionId} />}
        </div>
      )}

      <AddStudentModal open={showAdd} onOpenChange={setShowAdd} sections={sections} />
      <ImportResultModal
        open={Boolean(importResult)}
        onOpenChange={(v) => !v && setImportResult(null)}
        result={importResult}
      />
    </div>
  );
}
