import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { isBatchOrgType, resolveOrgTerm } from '@rooted/shared/utils';
import api from '../../lib/api.js';
import { useAuth } from '../../contexts/useAuth.js';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog.jsx';

const NEW_CLASS = '__new__';
const DEFAULT_SECTION_NAME = 'A';
const selectCls =
  'h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * Create a section without leaving the Students page. A section needs a class,
 * so the class is picked here — or created in the same step ("New <class>").
 * Batch orgs (coaching/tuition/study centre) have no real section tier: the
 * learner-facing unit is the batch, so creating one makes the class and a
 * default section together and only asks for the batch name.
 *
 * Callers must gate on `tenant:admin` (the API rejects anyone else) and mount
 * this only while open, so its form state starts fresh each time.
 */
export default function CreateSectionDialog({ open, onOpenChange, classes, classId, onCreated }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const orgType = user?.orgType;
  const isSchoolTerm = !orgType || orgType === 'school';
  const isBatch = isBatchOrgType(orgType);
  const classLabel = isSchoolTerm
    ? t('academic.students.classLabel')
    : resolveOrgTerm(orgType, 'classLevel');
  const sectionLabel = isSchoolTerm
    ? t('academic.students.section')
    : resolveOrgTerm(orgType, 'section');

  // Batch org opened from the "add student" form (no class chosen): one step, batch name only.
  const oneStep = isBatch && !classId;
  const [selectedClass, setSelectedClass] = useState(
    classId || (oneStep || !classes.length ? NEW_CLASS : '')
  );
  const [className, setClassName] = useState('');
  const [sectionName, setSectionName] = useState(DEFAULT_SECTION_NAME);
  const [error, setError] = useState('');

  const creatingClass = selectedClass === NEW_CLASS;

  const mutation = useMutation({
    mutationFn: async () => {
      let targetClassId = selectedClass;
      if (creatingClass) {
        const cls = await api.post('/academic/classes', { name: className }).then((r) => r.data);
        targetClassId = cls._id;
        // A retry after a failed section create must reuse this class, not re-create it.
        setSelectedClass(cls._id);
        setClassName('');
      }
      return api
        .post('/academic/sections', {
          classId: targetClassId,
          name: oneStep ? DEFAULT_SECTION_NAME : sectionName,
        })
        .then((r) => r.data);
    },
    onSuccess: (section) => {
      queryClient.invalidateQueries({ queryKey: ['classes-with-sections'] });
      onCreated?.(section);
      onOpenChange(false);
    },
    onError: (err) =>
      setError(err.response?.data?.error || t('academic.classesSections.createSectionFailed')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isSchoolTerm
              ? t('academic.classesSections.newSectionTitle')
              : `New ${oneStep ? classLabel : sectionLabel}`}
          </DialogTitle>
        </DialogHeader>
        <form
          id="create-section"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation(); // React bubbles through portals into AddStudentModal's <form>
            mutation.mutate();
          }}
          className="flex flex-col gap-4"
        >
          {!oneStep && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">{classLabel}</label>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className={selectCls}
                required
              >
                <option value="" disabled>
                  {t('academic.students.selectClass')}
                </option>
                {classes.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
                <option value={NEW_CLASS}>{t('academic.students.newClassOption')}</option>
              </select>
            </div>
          )}
          {creatingClass && (
            <Input
              label={oneStep ? t('common.name') : t('academic.students.newClassName')}
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              required
            />
          )}
          {!oneStep && (
            <Input
              label={t('academic.students.sectionName')}
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              required
            />
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="create-section" disabled={mutation.isPending}>
            {mutation.isPending ? t('common.saving') : t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
