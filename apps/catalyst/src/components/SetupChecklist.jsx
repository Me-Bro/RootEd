import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, Circle } from 'lucide-react';
import api from '@/lib/api.js';
import { useAuth } from '@/contexts/useAuth.js';
import { hasPermission } from '@/lib/access.js';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card.jsx';

/**
 * What a new college still has to set up, in order. Shown to administrators until
 * every step is done. Query keys match the pages that own the same data, so a step
 * ticks as soon as it is added. A failed or slow query just hides the card: it is
 * a nudge, never a blocker.
 */
export function SetupChecklist() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = hasPermission(user, 'tenant:admin');

  const terms = useQuery({
    queryKey: ['terms'],
    queryFn: () => api.get('/academic/terms').then((r) => r.data),
    enabled: isAdmin,
  });
  const subjects = useQuery({
    queryKey: ['subjects'],
    queryFn: () => api.get('/academic/subjects').then((r) => r.data),
    enabled: isAdmin,
  });
  const classes = useQuery({
    queryKey: ['classes-with-sections'],
    queryFn: () => api.get('/academic/classes?includeSections=true').then((r) => r.data),
    enabled: isAdmin,
  });
  // Any assignment at all, in any batch: the step is about starting, not finishing.
  const teaching = useQuery({
    queryKey: ['subject-teachers'],
    queryFn: () => api.get('/academic/subject-teachers').then((r) => r.data),
    enabled: isAdmin,
  });
  const students = useQuery({
    queryKey: ['students-count'],
    queryFn: () => api.get('/academic/students?limit=1').then((r) => r.data.total),
    enabled: isAdmin,
  });

  if (!isAdmin || [terms, subjects, classes, teaching, students].some((q) => !q.isSuccess))
    return null;

  // `to` is only set where the portal has a screen; creating a batch is still done in the web app.
  const steps = [
    { key: 'terms', done: terms.data.length > 0, to: '/setup' },
    { key: 'subjects', done: subjects.data.length > 0, to: '/setup' },
    { key: 'batches', done: classes.data.some((c) => c.sections?.length > 0) },
    { key: 'teaching', done: teaching.data.length > 0, to: '/teaching' },
    { key: 'students', done: students.data > 0, to: '/people/students' },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  return (
    <Card data-testid="setup-checklist">
      <CardHeader>
        <CardTitle as="h2">{t('setup.checklist.title')}</CardTitle>
        <CardDescription>
          {t('setup.checklist.progress', { done: doneCount, total: steps.length })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-2">
          {steps.map(({ key, done, to }) => (
            <li key={key} className="flex items-start gap-2 text-sm">
              {done ? (
                <Check className="mt-0.5 size-4 text-primary" aria-hidden="true" />
              ) : (
                <Circle className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" />
              )}
              <div>
                <span className={done ? 'text-muted-foreground line-through' : 'font-medium'}>
                  {t(`setup.checklist.${key}.title`)}
                </span>
                <span className="sr-only">
                  {done ? t('setup.checklist.done') : t('setup.checklist.todo')}
                </span>
                {!done && (
                  <p className="text-xs text-muted-foreground">
                    {t(`setup.checklist.${key}.hint`)}{' '}
                    {to && (
                      <Link to={to} className="font-medium text-foreground underline">
                        {t('setup.checklist.open')}
                      </Link>
                    )}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
