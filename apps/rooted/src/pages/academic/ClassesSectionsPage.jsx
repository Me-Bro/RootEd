import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { hasSeats, isBatchOrgType, resolveOrgTerm } from '@rooted/shared/utils';
import { apiError, formatShiftHours } from '../../utils/studyCenter.js';
import api from '../../lib/api.js';
import { useAuth } from '../../contexts/useAuth.js';
import { useClassSections } from '../../hooks/useClassSections.js';
import { useTeachers } from '../../hooks/useTeachers.js';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Card, CardContent } from '../../components/ui/Card.jsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog.jsx';
import { SelectField, SelectItem } from '../../components/ui/SelectField.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';

const CLASSES_QUERY_KEY = ['classes-with-sections'];

function ClassModal({ open, onOpenChange, classItem, classLevelLabel, isSchoolTerm, isBatch }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isEdit = Boolean(classItem);
  const { user } = useAuth();
  // A study center's batch is its shift, so it carries the hours (labels, nothing enforces them).
  const showHours = hasSeats(user?.orgType);
  const [form, setForm] = useState({
    name: classItem?.name ?? '',
    gradeLevel: classItem?.gradeLevel ?? '',
    startTime: classItem?.startTime ?? '',
    endTime: classItem?.endTime ?? '',
  });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      // Batch orgs have no grade level: leave any stored value untouched.
      const body = isBatch
        ? { name: form.name }
        : {
            name: form.name,
            gradeLevel: form.gradeLevel === '' ? undefined : Number(form.gradeLevel),
          };
      if (showHours) {
        // An edit sends null to clear an hour; a create just leaves it out.
        const empty = isEdit ? null : undefined;
        body.startTime = form.startTime || empty;
        body.endTime = form.endTime || empty;
      }
      return isEdit
        ? api.patch(`/academic/classes/${classItem._id}`, body).then((r) => r.data)
        : api.post('/academic/classes', body).then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CLASSES_QUERY_KEY });
      onOpenChange(false);
      if (!isEdit) {
        setForm({ name: '', gradeLevel: '', startTime: '', endTime: '' });
        setError('');
      }
    },
    onError: (err) =>
      setError(
        err.response?.data?.error ||
          t(
            isEdit
              ? 'academic.classesSections.updateClassFailed'
              : 'academic.classesSections.createClassFailed'
          )
      ),
  });

  const title = isSchoolTerm
    ? t(
        isEdit
          ? 'academic.classesSections.editClassTitle'
          : 'academic.classesSections.newClassTitle'
      )
    : `${isEdit ? 'Edit' : 'New'} ${classLevelLabel}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          id="class-form"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="flex flex-col gap-4"
        >
          <Input
            label={t('common.name')}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            placeholder={
              isBatch
                ? t('academic.classesSections.batchNamePlaceholder')
                : t('academic.classesSections.classNamePlaceholder')
            }
          />
          {!isBatch && (
            <Input
              label={t('academic.classesSections.gradeLevel')}
              type="number"
              value={form.gradeLevel}
              onChange={(e) => setForm((f) => ({ ...f, gradeLevel: e.target.value }))}
            />
          )}
          {showHours && (
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="time"
                id="class-start-time"
                label={t('studyCenter.shift.startTime')}
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
              />
              <Input
                type="time"
                id="class-end-time"
                label={t('studyCenter.shift.endTime')}
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
              />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="class-form" disabled={mutation.isPending}>
            {mutation.isPending
              ? t('common.saving')
              : isEdit
                ? t('common.save')
                : t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionModal({
  open,
  onOpenChange,
  classId,
  sectionItem,
  staff,
  sectionLabel,
  isSchoolTerm,
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isEdit = Boolean(sectionItem);
  const [form, setForm] = useState({
    name: sectionItem?.name ?? '',
    classTeacherId: sectionItem?.classTeacherId ?? '',
  });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      const body = { name: form.name, classTeacherId: form.classTeacherId || undefined };
      return isEdit
        ? api.patch(`/academic/sections/${sectionItem._id}`, body).then((r) => r.data)
        : api.post('/academic/sections', { ...body, classId }).then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CLASSES_QUERY_KEY });
      onOpenChange(false);
      if (!isEdit) {
        setForm({ name: '', classTeacherId: '' });
        setError('');
      }
    },
    onError: (err) =>
      setError(
        apiError(
          err,
          t(
            isEdit
              ? 'academic.classesSections.updateSectionFailed'
              : 'academic.classesSections.createSectionFailed'
          )
        )
      ),
  });

  const title = isSchoolTerm
    ? t(
        isEdit
          ? 'academic.classesSections.editSectionTitle'
          : 'academic.classesSections.newSectionTitle'
      )
    : `${isEdit ? 'Edit' : 'New'} ${sectionLabel}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          id="section-form"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="flex flex-col gap-4"
        >
          <Input
            label={t('common.name')}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            placeholder="A"
          />
          <SelectField
            label={t('academic.classesSections.assignTeacher')}
            value={form.classTeacherId}
            onValueChange={(v) => setForm((f) => ({ ...f, classTeacherId: v }))}
            placeholder={t('academic.classesSections.selectTeacherPlaceholder')}
          >
            {staff.map((s) => (
              <SelectItem key={s._id} value={s.userId}>
                {s.firstName} {s.lastName}
              </SelectItem>
            ))}
          </SelectField>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="section-form" disabled={mutation.isPending}>
            {mutation.isPending
              ? t('common.saving')
              : isEdit
                ? t('common.save')
                : t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ClassesSectionsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canWrite = (user?.permissions ?? []).includes('tenant:admin');
  const orgType = user?.orgType;
  const isSchoolTerm = !orgType || orgType === 'school';
  const isBatch = isBatchOrgType(orgType);
  const seatsOrg = hasSeats(orgType);

  const classLevelLabel = isSchoolTerm
    ? t('academic.classesSections.classLevel')
    : resolveOrgTerm(orgType, 'classLevel');
  const sectionLabel = isSchoolTerm
    ? t('academic.classesSections.section')
    : resolveOrgTerm(orgType, 'section');

  const { classes, isLoading } = useClassSections();
  const { staff, nameById: teacherNameById } = useTeachers();

  const [showCreateClass, setShowCreateClass] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [addSectionFor, setAddSectionFor] = useState(null); // classId | null
  const [editingSection, setEditingSection] = useState(null);

  const sortedClasses = [...classes].sort(
    isBatch
      ? (a, b) => (a.name ?? '').localeCompare(b.name ?? '')
      : (a, b) => (a.gradeLevel ?? 0) - (b.gradeLevel ?? 0)
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          isSchoolTerm
            ? t('academic.classesSections.title')
            : seatsOrg
              ? `${classLevelLabel}es`
              : `${classLevelLabel} & ${sectionLabel}`
        }
        action={
          canWrite && (
            <Button onClick={() => setShowCreateClass(true)}>
              {isSchoolTerm ? t('academic.classesSections.newClass') : `New ${classLevelLabel}`}
            </Button>
          )
        }
      />

      {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}

      {!isLoading && sortedClasses.length === 0 && (
        <EmptyState
          title={t('academic.classesSections.emptyTitle')}
          description={canWrite ? t('academic.classesSections.emptyDescription') : undefined}
        />
      )}

      <div className="flex flex-col gap-3">
        {sortedClasses.map((cls) => (
          <Card key={cls._id}>
            <CardContent>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-semibold">{cls.name}</p>
                  {seatsOrg && (
                    <p className="text-xs text-muted-foreground">
                      {formatShiftHours(cls.startTime, cls.endTime)}
                    </p>
                  )}
                  {!isBatch && cls.gradeLevel != null && (
                    <p className="text-xs text-muted-foreground">
                      {t('academic.classesSections.gradeLevel')}: {cls.gradeLevel}
                    </p>
                  )}
                </div>
                {canWrite && (
                  <Button size="sm" variant="outline" onClick={() => setEditingClass(cls)}>
                    {t('common.edit')}
                  </Button>
                )}
              </div>

              {/* A study center's batch is the shift: no groups under it. */}
              {!seatsOrg && (
                <div className="mt-3 flex flex-col gap-2">
                  {(cls.sections ?? []).map((section) => (
                    <div
                      key={section._id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{section.name}</p>
                        {hasSeats(orgType) ? (
                          <p className="text-xs text-muted-foreground">
                            {formatShiftHours(section.startTime, section.endTime)}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {section.classTeacherId
                              ? (teacherNameById.get(section.classTeacherId) ??
                                t('academic.classesSections.noTeacherAssigned'))
                              : t('academic.classesSections.noTeacherAssigned')}
                          </p>
                        )}
                      </div>
                      {!hasSeats(user?.orgType) && (
                        <Link
                          to={`/academic/subjects?classId=${cls._id}`}
                          className="ml-auto text-xs text-muted-foreground hover:underline"
                        >
                          {t('academic.classesSections.subjectsLink')}
                        </Link>
                      )}
                      {canWrite && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingSection(section)}
                        >
                          {t('common.edit')}
                        </Button>
                      )}
                    </div>
                  ))}
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => setAddSectionFor(cls._id)}
                      className="rounded-lg border border-dashed border-border px-3 py-2 text-left text-sm text-muted-foreground hover:border-primary hover:text-primary"
                    >
                      {isSchoolTerm
                        ? t('academic.classesSections.newSection')
                        : `Add ${sectionLabel}`}
                    </button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <ClassModal
        open={showCreateClass}
        onOpenChange={setShowCreateClass}
        classLevelLabel={classLevelLabel}
        isSchoolTerm={isSchoolTerm}
        isBatch={isBatch}
      />

      {editingClass && (
        <ClassModal
          open
          onOpenChange={(v) => !v && setEditingClass(null)}
          classItem={editingClass}
          classLevelLabel={classLevelLabel}
          isSchoolTerm={isSchoolTerm}
          isBatch={isBatch}
        />
      )}

      {addSectionFor && (
        <SectionModal
          open
          onOpenChange={(v) => !v && setAddSectionFor(null)}
          classId={addSectionFor}
          staff={staff}
          sectionLabel={sectionLabel}
          isSchoolTerm={isSchoolTerm}
        />
      )}

      {editingSection && (
        <SectionModal
          open
          onOpenChange={(v) => !v && setEditingSection(null)}
          sectionItem={editingSection}
          staff={staff}
          sectionLabel={sectionLabel}
          isSchoolTerm={isSchoolTerm}
        />
      )}
    </div>
  );
}
