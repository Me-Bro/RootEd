import { useDeferredValue, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Upload, UserPlus } from 'lucide-react';
import api from '@/lib/api.js';
import { useAuth } from '@/contexts/useAuth.js';
import { hasPermission } from '@/lib/access.js';
import { fullName } from '@/lib/format.js';
import { downloadCsv } from '@/lib/csv.js';
import { pushToast } from '@/lib/toast.js';
import { BADGE_VARIANT, studentLoginState } from '@/lib/people.js';
import { ConfirmAction } from '@/components/ConfirmAction.jsx';
import { PageHeader } from '@/components/ui/PageHeader.jsx';
import { Button } from '@/components/ui/Button.jsx';
import { Badge } from '@/components/ui/Badge.jsx';
import { Input, Select } from '@/components/ui/Input.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card.jsx';
import { EmptyState, ErrorNote, ListSkeleton } from '@/components/ui/Feedback.jsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table.jsx';

const PAGE_SIZE = 50;
const refresh = (qc) => qc.invalidateQueries({ queryKey: ['people-students'] });

/** Every batch of the college, labelled with its class (section names repeat). */
function useBatches() {
  const query = useQuery({
    queryKey: ['classes-with-sections'],
    queryFn: () => api.get('/academic/classes?includeSections=true').then((r) => r.data),
  });
  const batches = (query.data ?? []).flatMap((c) =>
    (c.sections ?? []).map((s) => ({ _id: s._id, label: `${c.name} — ${s.name}` }))
  );
  return batches;
}

function AddStudent({ batches, onDone }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    admissionNo: '',
    firstName: '',
    lastName: '',
    sectionId: '',
    email: '',
  });
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const add = useMutation({
    mutationFn: async () => {
      const { email, sectionId, ...rest } = form;
      const { data: student } = await api.post('/academic/students', {
        ...rest,
        ...(sectionId ? { sectionId } : {}),
      });
      if (email) await api.post(`/academic/students/${student._id}/account`, { email });
    },
    onSuccess: () => {
      refresh(qc);
      onDone();
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('people.students.add.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          aria-label={t('people.students.add.title')}
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <Input
            label={t('people.students.add.admissionNo')}
            value={form.admissionNo}
            onChange={set('admissionNo')}
            required
          />
          <Input
            label={t('people.students.add.firstName')}
            value={form.firstName}
            onChange={set('firstName')}
            required
          />
          <Input
            label={t('people.students.add.lastName')}
            value={form.lastName}
            onChange={set('lastName')}
            required
          />
          <Select
            label={t('people.students.add.batch')}
            value={form.sectionId}
            onChange={set('sectionId')}
          >
            <option value="">{t('people.students.add.noBatch')}</option>
            {batches.map((b) => (
              <option key={b._id} value={b._id}>
                {b.label}
              </option>
            ))}
          </Select>
          <Input
            type="email"
            label={t('people.students.add.email')}
            value={form.email}
            onChange={set('email')}
          />
          <div className="flex items-end">
            <Button type="submit" disabled={add.isPending}>
              {t('people.students.add.submit')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ImportStudents({ batches, onDone }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [sectionId, setSectionId] = useState('');
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);

  const run = useMutation({
    mutationFn: () => {
      const body = new FormData();
      body.append('sectionId', sectionId);
      body.append('file', file);
      return api.post('/academic/students/import', body).then((r) => r.data);
    },
    onSuccess: (data) => {
      setResult(data);
      refresh(qc);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('people.students.import.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t('people.students.import.intro')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label={t('people.students.import.batch')}
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
          >
            <option value="">{t('people.students.import.needBatch')}</option>
            {batches.map((b) => (
              <option key={b._id} value={b._id}>
                {b.label}
              </option>
            ))}
          </Select>
          <Input
            type="file"
            accept=".csv,text/csv"
            label={t('people.students.import.file')}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!sectionId || !file || run.isPending} onClick={() => run.mutate()}>
            <Upload className="size-4" aria-hidden="true" />
            {t('people.students.import.run')}
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              downloadCsv(
                'students-sample.csv',
                ['admissionNo', 'firstName', 'lastName', 'email'],
                [['CC-001', 'Asha', 'Rao', 'asha@example.com']]
              )
            }
          >
            {t('people.students.import.sample')}
          </Button>
          <Button variant="ghost" onClick={onDone}>
            {t('common.close')}
          </Button>
        </div>
        {result && (
          <div role="status" data-testid="import-result" className="text-sm">
            <p>
              {t('people.students.import.result', {
                created: result.created,
                skipped: result.skipped,
                accounts: result.accountsProvisioned,
              })}
            </p>
            {result.errors.length > 0 && (
              <div className="mt-2">
                <p className="font-medium">
                  {t('people.students.import.problems', { count: result.errors.length })}
                </p>
                <ul className="list-disc pl-5 text-muted-foreground">
                  {result.errors.map((e, i) => (
                    <li key={i}>
                      {e.row?.admissionNo ?? '—'}: {e.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StudentRow({ student, canWrite, canSuspend }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [email, setEmail] = useState('');
  const name = fullName(student);
  const state = studentLoginState(student.account);

  const give = useMutation({
    mutationFn: () => api.post(`/academic/students/${student._id}/account`, { email }),
    onSuccess: () => {
      setAsking(false);
      setEmail('');
      refresh(qc);
    },
  });
  const resend = useMutation({
    mutationFn: () => api.post(`/academic/students/${student._id}/account/resend`),
    meta: { silent: true },
    onSuccess: () => pushToast(t('people.linkSent')),
    onError: (err) => pushToast(err.response?.data?.error || t('common.error'), 'error'),
  });
  const setStatus = useMutation({
    mutationFn: (status) =>
      api.patch(`/tenant/members/${student.account.membershipId}/status`, { status }),
    onSuccess: () => refresh(qc),
  });

  return (
    <TableRow data-testid={`student-row-${student.admissionNo}`}>
      <TableCell>
        <div className="font-medium">{name}</div>
        <div className="text-xs text-muted-foreground">{student.admissionNo}</div>
      </TableCell>
      {canWrite && (
        <TableCell>
          <Badge variant={BADGE_VARIANT[state]} data-testid="login-state">
            {t(`people.state.${state}`)}
          </Badge>
          {student.account?.email && (
            <div className="mt-1 text-xs text-muted-foreground">{student.account.email}</div>
          )}
        </TableCell>
      )}
      {canWrite && (
        <TableCell>
          {state === 'none' && !asking && (
            <Button
              size="sm"
              variant="outline"
              aria-label={t('people.students.giveLoginFor', { name })}
              onClick={() => setAsking(true)}
            >
              {t('people.students.giveLogin')}
            </Button>
          )}
          {state === 'none' && asking && (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                give.mutate();
              }}
            >
              <Input
                type="email"
                required
                label={t('people.students.emailFor', { name })}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" size="sm" disabled={give.isPending}>
                {t('people.students.send')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
                {t('common.cancel')}
              </Button>
            </form>
          )}
          {state === 'pending' && (
            <Button
              size="sm"
              variant="outline"
              aria-label={t('people.students.resendFor', { name })}
              disabled={resend.isPending}
              onClick={() => resend.mutate()}
            >
              {t('people.students.resend')}
            </Button>
          )}
          {canSuspend && (state === 'active' || state === 'pending') && (
            <ConfirmAction
              label={t('people.students.suspend')}
              confirmLabel={t('people.students.confirmSuspend')}
              ariaLabel={t('people.students.suspendFor', { name })}
              confirmAriaLabel={t('people.students.confirmSuspendFor', { name })}
              pending={setStatus.isPending}
              onConfirm={() => setStatus.mutate('suspended')}
            />
          )}
          {canSuspend && state === 'suspended' && (
            <Button
              size="sm"
              variant="outline"
              aria-label={t('people.students.reactivateFor', { name })}
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate('active')}
            >
              {t('people.students.reactivate')}
            </Button>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}

export default function PeopleStudentsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canWrite = hasPermission(user, 'students:write');
  const canSuspend = canWrite && hasPermission(user, 'roles:write');
  const batches = useBatches();

  const [sectionId, setSectionId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [panel, setPanel] = useState(null); // 'add' | 'import' | null
  const q = useDeferredValue(search);

  const list = useQuery({
    queryKey: ['people-students', { sectionId, q, page }],
    queryFn: () =>
      api
        .get('/academic/students', {
          params: {
            page,
            limit: PAGE_SIZE,
            ...(sectionId && { sectionId }),
            ...(q && { search: q }),
          },
        })
        .then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  const students = list.data?.students ?? [];
  const toggle = (name) => setPanel((p) => (p === name ? null : name));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('people.students.title')}
        description={t('people.students.description')}
        action={
          canWrite && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => toggle('import')}>
                <Upload className="size-4" aria-hidden="true" />
                {t('people.students.import.open')}
              </Button>
              <Button onClick={() => toggle('add')}>
                <UserPlus className="size-4" aria-hidden="true" />
                {t('people.students.add.open')}
              </Button>
            </div>
          )
        }
      />

      {panel === 'add' && <AddStudent batches={batches} onDone={() => setPanel(null)} />}
      {panel === 'import' && <ImportStudents batches={batches} onDone={() => setPanel(null)} />}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48">
          <Select
            label={t('people.students.batch')}
            value={sectionId}
            onChange={(e) => {
              setSectionId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('people.students.allBatches')}</option>
            {batches.map((b) => (
              <option key={b._id} value={b._id}>
                {b.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full max-w-xs">
          <Input
            type="search"
            label={t('common.search')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {list.isLoading && <ListSkeleton />}
      {list.error && <ErrorNote error={list.error} onRetry={() => list.refetch()} />}
      {list.data && students.length === 0 && (
        <EmptyState
          title={q || sectionId ? t('common.noMatches') : t('people.students.empty')}
          description={q || sectionId ? undefined : t('people.students.emptyHint')}
        />
      )}
      {students.length > 0 && (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('people.students.student')}</TableHead>
                  {canWrite && <TableHead>{t('people.students.login')}</TableHead>}
                  {canWrite && <TableHead>{t('people.students.actions')}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((s) => (
                  <StudentRow key={s._id} student={s} canWrite={canWrite} canSuspend={canSuspend} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {list.data?.pages > 1 && (
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            {t('people.students.previous')}
          </Button>
          <span role="status" className="text-sm text-muted-foreground">
            {t('people.students.page', { page, pages: list.data.pages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= list.data.pages}
            onClick={() => setPage(page + 1)}
          >
            {t('people.students.next')}
          </Button>
        </div>
      )}
    </div>
  );
}
