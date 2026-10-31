import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { useAuth } from '../../contexts/useAuth.js';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { SelectField, SelectItem } from '../../components/ui/SelectField.jsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog.jsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table.jsx';
import SubjectTeachersDialog from '../../components/academic/SubjectTeachersDialog.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';

const EMPTY_FORM = { name: '', code: '', classId: '' };
const EMPTY_ARRAY = [];

// One dialog for both add and edit. `subject` null = add. A subject's class can
// be set or changed here but not cleared (the API's classId is optional, not nullable).
function SubjectDialog({ open, subject, classes, onClose }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  // Reset the form whenever the dialog opens for a different subject.
  const [loadedFor, setLoadedFor] = useState(null);
  const key = open ? (subject?._id ?? 'new') : null;
  if (key !== loadedFor) {
    setLoadedFor(key);
    if (open) {
      setForm(
        subject
          ? { name: subject.name, code: subject.code, classId: subject.classId ?? '' }
          : EMPTY_FORM
      );
      setError('');
    }
  }

  const save = useMutation({
    mutationFn: () => {
      const body = { name: form.name, code: form.code };
      if (form.classId) body.classId = form.classId;
      return subject
        ? api.patch(`/academic/subjects/${subject._id}`, body)
        : api.post('/academic/subjects', body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjects'] });
      onClose();
    },
    onError: (err) => setError(err.response?.data?.error || t('academic.subjects.saveFailed')),
  });

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {subject ? t('academic.subjects.editTitle') : t('academic.subjects.addTitle')}
          </DialogTitle>
        </DialogHeader>
        <form
          id="subject-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Input label={t('common.name')} value={form.name} onChange={set('name')} required />
          <Input
            label={t('academic.subjects.code')}
            value={form.code}
            onChange={set('code')}
            required
          />
          <SelectField
            label={t('academic.subjects.class')}
            value={form.classId}
            onValueChange={(v) => setForm((f) => ({ ...f, classId: v }))}
            placeholder={t('academic.subjects.anyClass')}
          >
            {classes.map((c) => (
              <SelectItem key={c._id} value={c._id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectField>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="subject-form" disabled={save.isPending}>
            {save.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SubjectsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canWrite = (user?.permissions ?? []).includes('tenant:admin');
  const [searchParams, setSearchParams] = useSearchParams();
  const classFilter = searchParams.get('classId');

  // null = closed, 'new' = add, otherwise the subject being edited.
  const [dialog, setDialog] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [teachersFor, setTeachersFor] = useState(null);

  const {
    data: subjects = EMPTY_ARRAY,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => api.get('/academic/subjects').then((r) => r.data),
  });
  const { data: classes = EMPTY_ARRAY } = useQuery({
    queryKey: ['classes'],
    queryFn: () => api.get('/academic/classes').then((r) => r.data),
  });
  const classNames = new Map(classes.map((c) => [c._id, c.name]));
  // Reached from a class's "Subjects and teachers" link: that class's subjects, plus
  // the ones with no class, which apply to every class.
  const shown = classFilter
    ? subjects.filter((x) => !x.classId || x.classId === classFilter)
    : subjects;

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/academic/subjects/${id}`),
    onMutate: () => setDeleteError(''),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subjects'] }),
    onError: (err) =>
      setDeleteError(err.response?.data?.error || t('academic.subjects.deleteFailed')),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('academic.subjects.title')}
        description={t('academic.subjects.description')}
        action={
          canWrite && <Button onClick={() => setDialog('new')}>{t('academic.subjects.add')}</Button>
        }
      />

      {error && <p className="text-sm text-destructive">{t('academic.subjects.loadError')}</p>}
      {deleteError && (
        <p role="alert" className="text-sm text-destructive">
          {deleteError}
        </p>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
      {!isLoading && !error && subjects.length === 0 && (
        <EmptyState
          title={t('academic.subjects.emptyTitle')}
          description={canWrite ? t('academic.subjects.emptyDescription') : undefined}
        />
      )}

      {classFilter && (
        <p className="text-sm text-muted-foreground">
          {t('academic.subjects.filteredBy', { name: classNames.get(classFilter) ?? '—' })}{' '}
          <button type="button" className="underline" onClick={() => setSearchParams({})}>
            {t('academic.subjects.clearFilter')}
          </button>
        </p>
      )}

      {subjects.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('common.name')}</TableHead>
              <TableHead>{t('academic.subjects.code')}</TableHead>
              <TableHead>{t('academic.subjects.class')}</TableHead>
              {canWrite && (
                <TableHead>
                  <span className="sr-only">{t('common.actions')}</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((s) => (
              <TableRow key={s._id} data-testid={`subject-row-${s.code}`}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.code}</TableCell>
                <TableCell>
                  {classNames.get(s.classId) ?? t('academic.subjects.anyClass')}
                </TableCell>
                {canWrite && (
                  <TableCell>
                    <span className="flex justify-end gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setTeachersFor(s)}>
                        {t('academic.subjects.teachers')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDialog(s)}>
                        {t('common.edit')}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={remove.isPending}
                        onClick={() =>
                          window.confirm(t('academic.subjects.confirmDelete', { name: s.name })) &&
                          remove.mutate(s._id)
                        }
                      >
                        {t('common.delete')}
                      </Button>
                    </span>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {teachersFor && (
        <SubjectTeachersDialog subject={teachersFor} onClose={() => setTeachersFor(null)} />
      )}

      <SubjectDialog
        open={dialog !== null}
        subject={dialog === 'new' ? null : dialog}
        classes={classes}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
