import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api.js';
import { fmtDate } from '@/lib/format.js';
import { PageHeader } from '@/components/ui/PageHeader.jsx';
import { Button } from '@/components/ui/Button.jsx';
import { Input } from '@/components/ui/Input.jsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card.jsx';
import { EmptyState, ErrorNote, Spinner } from '@/components/ui/Feedback.jsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table.jsx';

const EMPTY_RANGE = { name: '', startDate: '', endDate: '' };

/** name + start + end: an academic year and a term are the same three fields. */
function RangeForm({ submitLabel, mutation, onDone }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(EMPTY_RANGE);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = useMutation({
    mutationFn: () => mutation(form),
    onSuccess: () => {
      setForm(EMPTY_RANGE);
      onDone();
    },
  });

  return (
    <form
      className="grid gap-3 sm:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Input label={t('setup.name')} value={form.name} onChange={set('name')} required />
      <Input
        label={t('setup.startDate')}
        type="date"
        value={form.startDate}
        onChange={set('startDate')}
        required
      />
      <Input
        label={t('setup.endDate')}
        type="date"
        min={form.startDate}
        value={form.endDate}
        onChange={set('endDate')}
        required
      />
      <div className="flex items-end">
        <Button type="submit" disabled={save.isPending}>
          {submitLabel}
        </Button>
      </div>
      {save.error && (
        <div className="sm:col-span-4">
          <ErrorNote error={save.error} />
        </div>
      )}
    </form>
  );
}

function TermsCard() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const years = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => api.get('/academic/years').then((r) => r.data),
  });
  const terms = useQuery({
    queryKey: ['terms'],
    queryFn: () => api.get('/academic/terms').then((r) => r.data),
  });
  const refresh = (key) => () => queryClient.invalidateQueries({ queryKey: [key] });

  // POST /academic/years makes the new year the active one.
  const year = years.data?.find((y) => y.isActive) ?? years.data?.[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t('setup.terms.title')}</CardTitle>
        <CardDescription>{t('setup.terms.hint')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {(years.isLoading || terms.isLoading) && <Spinner />}
        {(years.error || terms.error) && (
          <ErrorNote error={years.error || terms.error} onRetry={terms.refetch} />
        )}
        {years.data && !year && (
          <>
            <p className="text-sm">{t('setup.terms.needYear')}</p>
            <RangeForm
              submitLabel={t('setup.terms.createYear')}
              mutation={(form) => api.post('/academic/years', form)}
              onDone={refresh('academic-years')}
            />
          </>
        )}
        {year && (
          <RangeForm
            submitLabel={t('setup.terms.add')}
            mutation={(form) => api.post('/academic/terms', { academicYearId: year._id, ...form })}
            onDone={refresh('terms')}
          />
        )}
        {terms.data?.length === 0 && <EmptyState title={t('setup.terms.none')} />}
        {terms.data?.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('setup.name')}</TableHead>
                <TableHead>{t('setup.startDate')}</TableHead>
                <TableHead>{t('setup.endDate')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {terms.data.map((term) => (
                <TableRow key={term._id}>
                  <TableCell className="font-medium">{term.name}</TableCell>
                  <TableCell>{fmtDate(term.startDate, i18n.language)}</TableCell>
                  <TableCell>{fmtDate(term.endDate, i18n.language)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function SubjectsCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', code: '' });
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const subjects = useQuery({
    queryKey: ['subjects'],
    queryFn: () => api.get('/academic/subjects').then((r) => r.data),
  });
  const create = useMutation({
    mutationFn: () => api.post('/academic/subjects', form),
    onSuccess: () => {
      setForm({ name: '', code: '' });
      queryClient.invalidateQueries({ queryKey: ['subjects'] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t('setup.subjects.title')}</CardTitle>
        <CardDescription>{t('setup.subjects.hint')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          className="grid gap-3 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="sm:col-span-2">
            <Input label={t('setup.name')} value={form.name} onChange={set('name')} required />
          </div>
          <Input label={t('setup.code')} value={form.code} onChange={set('code')} required />
          <div className="flex items-end">
            <Button type="submit" disabled={create.isPending}>
              {t('setup.subjects.add')}
            </Button>
          </div>
        </form>
        {create.error && <ErrorNote error={create.error} />}
        {subjects.isLoading && <Spinner />}
        {subjects.error && <ErrorNote error={subjects.error} onRetry={subjects.refetch} />}
        {subjects.data?.length === 0 && <EmptyState title={t('setup.subjects.none')} />}
        {subjects.data?.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('setup.name')}</TableHead>
                <TableHead>{t('setup.code')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subjects.data.map((s) => (
                <TableRow key={s._id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.code}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function SetupPage() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('setup.title')} description={t('setup.description')} />
      <TermsCard />
      <SubjectsCard />
    </div>
  );
}
