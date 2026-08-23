import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { useAuth } from '../../contexts/useAuth.js';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import DepartmentSection from '../../components/staff/DepartmentSection.jsx';
import OnLeaveStrip from '../../components/staff/OnLeaveStrip.jsx';

function AddStaffModal({ open, onOpenChange }) {
  const { t } = useTranslation();
  const STEPS = [
    t('staff.directory.steps.basicInfo'),
    t('staff.directory.steps.contact'),
    t('staff.directory.steps.review'),
  ];
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');

  const { register, handleSubmit, getValues } = useForm({
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
      employeeId: '',
      designation: '',
      department: '',
      joiningDate: '',
      phone: '',
      address: '',
      dateOfBirth: '',
      gender: '',
    },
  });

  const mutation = useMutation({
    mutationFn: (data) => api.post('/staff/members', data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-members'] });
      onOpenChange(false);
      setStep(0);
      setError('');
    },
    onError: (err) => setError(err.response?.data?.error || t('staff.directory.addFailed')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('staff.directory.addStaffTitle', { step: STEPS[step] })}</DialogTitle>
          <div className="flex gap-2 mt-1">
            {STEPS.map((s, i) => (
              <span
                key={s}
                className={[
                  'text-xs px-2 py-0.5 rounded-full font-medium',
                  i === step
                    ? 'bg-primary text-primary-foreground'
                    : i < step
                      ? 'bg-muted text-foreground'
                      : 'bg-muted text-muted-foreground',
                ].join(' ')}
              >
                {s}
              </span>
            ))}
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit((data) => mutation.mutate(data))}>
          {step === 0 && (
            <div className="flex flex-col gap-4">
              <Input
                label={t('staff.directory.email')}
                type="email"
                {...register('email', { required: true })}
              />
              <Input
                label={t('staff.directory.firstName')}
                {...register('firstName', { required: true })}
              />
              <Input
                label={t('staff.directory.lastName')}
                {...register('lastName', { required: true })}
              />
              <Input label={t('staff.directory.employeeId')} {...register('employeeId')} />
              <Input label={t('staff.directory.designation')} {...register('designation')} />
              <Input label={t('staff.directory.department')} {...register('department')} />
              <Input
                label={t('staff.directory.joiningDate')}
                type="date"
                {...register('joiningDate')}
              />
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <Input label={t('staff.directory.phone')} {...register('phone')} />
              <Input label={t('staff.directory.address')} {...register('address')} />
              <Input
                label={t('staff.directory.dateOfBirth')}
                type="date"
                {...register('dateOfBirth')}
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">{t('staff.directory.gender')}</label>
                <select
                  {...register('gender')}
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="">{t('staff.directory.selectPlaceholder')}</option>
                  <option value="male">{t('staff.directory.male')}</option>
                  <option value="female">{t('staff.directory.female')}</option>
                  <option value="other">{t('staff.directory.other')}</option>
                </select>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-2 text-sm">
              <p className="font-medium text-muted-foreground">
                {t('staff.directory.reviewDetails')}
              </p>
              {Object.entries(getValues()).map(([k, v]) =>
                v ? (
                  <div key={k} className="flex justify-between border-b border-border py-1">
                    <span className="text-muted-foreground capitalize">
                      {k.replace(/([A-Z])/g, ' $1')}
                    </span>
                    <span className="font-medium">{v}</span>
                  </div>
                ) : null
              )}
            </div>
          )}

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              type="button"
              onClick={step === 0 ? () => onOpenChange(false) : () => setStep((s) => s - 1)}
            >
              {step === 0 ? t('common.cancel') : t('staff.directory.back')}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button
                type="button"
                onClick={(e) => {
                  // The button occupying this footer slot becomes a
                  // type="submit" Submit button once this click advances to
                  // the last step — React swaps the type synchronously
                  // during this same click, and the browser's native
                  // default-action check (which runs after React's render)
                  // then sees "submit" and fires the form early. Suppress
                  // that default action explicitly rather than relying on
                  // type="button" alone.
                  e.preventDefault();
                  setStep((s) => s + 1);
                }}
              >
                {t('staff.directory.next')}
              </Button>
            ) : (
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? t('common.saving') : t('staff.directory.submit')}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImportResultModal({ open, onOpenChange, result }) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('staff.directory.importResultsTitle')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            {t('staff.directory.createdCount', { count: result?.created ?? 0 })}
          </p>
          <p className="text-sm text-amber-600 dark:text-amber-400">
            {t('staff.directory.skippedDuplicateCount', { count: result?.skipped ?? 0 })}
          </p>
          <p className="text-sm text-destructive">
            {t('staff.directory.errorsCount', { count: result?.errors?.length ?? 0 })}
          </p>
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
          <Button onClick={() => onOpenChange(false)}>{t('common.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// §3 "State & logic": groups the flat member list by department for the
// default (non-search) view.
function groupByDepartment(members) {
  const groups = {};
  for (const member of members) {
    const key = member.department || 'Unassigned';
    (groups[key] ??= []).push(member);
  }
  return groups;
}

function matchesSearch(member, term) {
  const needle = term.toLowerCase();
  const fullName = `${member.firstName ?? ''} ${member.lastName ?? ''}`.toLowerCase();
  return fullName.includes(needle) || (member.employeeId ?? '').toLowerCase().includes(needle);
}

export default function StaffPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canWrite = (user?.permissions ?? []).includes('staff:write');
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);

  // §2 API contract: one bulk fetch (limit=100, the server's cap) instead of
  // the old page-by-20 table — 74 rows is small enough to group/search
  // client-side. A tenant with >100 staff would only see the first 100 here;
  // that's the spec's documented tradeoff, not a regression to fix in this pass.
  const { data, isLoading, error } = useQuery({
    queryKey: ['staff-members'],
    queryFn: () => api.get('/staff/members?limit=100').then((r) => r.data),
  });

  const importMutation = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('file', file);
      return api
        .post('/staff/members/import', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then((r) => r.data);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['staff-members'] });
      setImportResult(result);
    },
  });

  const members = data?.members ?? [];
  const departmentNames = [...new Set(members.map((m) => m.department).filter(Boolean))];
  const onLeave = members.filter((m) => m.employmentStatus === 'on_leave');

  const trimmedSearch = search.trim();
  const filtered = trimmedSearch ? members.filter((m) => matchesSearch(m, trimmedSearch)) : null;

  const byDepartment = groupByDepartment(members);
  const departments = Object.keys(byDepartment).sort((a, b) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('staff.directory.title')}
        description={
          data
            ? t('staff.directory.summary', {
                staffCount: members.length,
                deptCount: departmentNames.length,
              })
            : undefined
        }
        action={
          canWrite && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={importMutation.isPending}
              >
                {importMutation.isPending
                  ? t('staff.directory.importing')
                  : t('staff.directory.importCsv')}
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
              <Button onClick={() => setShowAdd(true)}>{t('staff.directory.addStaff')}</Button>
            </div>
          )
        }
      />

      <Input
        placeholder={t('staff.directory.searchPlaceholder')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      {error && <p className="text-destructive">{t('staff.directory.loadFailed')}</p>}
      {isLoading && (
        <p className="text-sm text-muted-foreground">{t('staff.directory.loadingStaff')}</p>
      )}

      {!isLoading && !error && (
        <>
          <OnLeaveStrip members={onLeave} />

          {members.length === 0 ? (
            <EmptyState
              title={t('staff.directory.emptyTitle')}
              description={t('staff.directory.emptyDescription')}
            />
          ) : filtered ? (
            filtered.length === 0 ? (
              <EmptyState title={t('staff.directory.emptySearchTitle')} />
            ) : (
              <DepartmentSection members={filtered} />
            )
          ) : (
            <div className="flex flex-col gap-5">
              {departments.map((dept) => (
                <DepartmentSection key={dept} department={dept} members={byDepartment[dept]} />
              ))}
            </div>
          )}
        </>
      )}

      <AddStaffModal open={showAdd} onOpenChange={setShowAdd} />
      <ImportResultModal
        open={Boolean(importResult)}
        onOpenChange={(v) => !v && setImportResult(null)}
        result={importResult}
      />
    </div>
  );
}
