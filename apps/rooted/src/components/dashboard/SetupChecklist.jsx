import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, Circle } from 'lucide-react';
import { hasSeats, isModuleEnabled } from '@rooted/shared/utils';
import api from '../../lib/api.js';
import { useAuth } from '../../contexts/useAuth.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card.jsx';
import { setupSteps } from '../../utils/setupSteps.js';

const get = (url, params) => api.get(url, { params }).then((r) => r.data);

function useSetupQuery(key, url, params, enabled) {
  return useQuery({ queryKey: ['setup', key], queryFn: () => get(url, params), enabled });
}

/**
 * What a new school (or study center) still has to set up, in order, for tenant admins. Hidden once every
 * step is done. A failed or slow query hides the card: it is a nudge, never a blocker.
 */
export default function SetupChecklist() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = (user?.permissions ?? []).includes('tenant:admin');
  const staffEnabled = isModuleEnabled(user, 'staff');
  const feeEnabled = isModuleEnabled(user, 'fee');
  // A study center has its own steps (shift, seats, plan, members): no terms, subjects or
  // teaching, and its academic year is created for it.
  const seats = hasSeats(user?.orgType);
  const school = isAdmin && !seats;
  const centre = isAdmin && seats;

  const years = useSetupQuery('years', '/academic/years', undefined, school);
  const terms = useSetupQuery('terms', '/academic/terms', undefined, school);
  const classes = useSetupQuery('classes', '/academic/classes', { includeSections: true }, isAdmin);
  const subjects = useSetupQuery('subjects', '/academic/subjects', undefined, school);
  const staff = useSetupQuery('staff', '/staff/members', { limit: 1 }, school && staffEnabled);
  const assignments = useSetupQuery('teaching', '/academic/subject-teachers', undefined, school);
  const students = useSetupQuery('students', '/academic/students', { limit: 1 }, isAdmin);
  const seatList = useSetupQuery('seats', '/academic/seats', undefined, centre);
  const plans = useSetupQuery('plans', '/fee/structures', undefined, centre && feeEnabled);

  const required = seats
    ? [classes, seatList, students, ...(feeEnabled ? [plans] : [])]
    : [years, terms, classes, subjects, assignments, students, ...(staffEnabled ? [staff] : [])];
  if (!isAdmin || required.some((q) => !q.isSuccess)) return null;

  const steps = setupSteps({
    seats,
    years: years.data ?? [],
    terms: terms.data ?? [],
    classes: classes.data,
    subjects: subjects.data ?? [],
    staffTotal: staffEnabled && !seats ? staff.data.total : undefined,
    assignments: assignments.data ?? [],
    studentsTotal: students.data.total,
    seatCount: seatList.data?.length ?? 0,
    planCount: feeEnabled ? plans.data?.filter((f) => f.plan).length : undefined,
  });
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  return (
    <Card data-testid="setup-checklist">
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          {t(seats ? 'dashboard.setup.titleCentre' : 'dashboard.setup.title')}
        </CardTitle>
        <CardDescription>
          {t('dashboard.setup.progress', { done: doneCount, total: steps.length })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-3">
          {steps.map(({ key, done, to }) => (
            <li key={key} className="flex items-start gap-2 text-sm">
              {done ? (
                <Check className="mt-0.5 size-4 text-primary" aria-hidden="true" />
              ) : (
                <Circle className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" />
              )}
              <div>
                <span className={done ? 'text-muted-foreground line-through' : 'font-medium'}>
                  {t(`dashboard.setup.${key}.title`)}
                </span>
                <span className="sr-only">
                  {done ? t('dashboard.setup.done') : t('dashboard.setup.todo')}
                </span>
                {!done && (
                  <p className="text-xs text-muted-foreground">
                    {t(`dashboard.setup.${key}.hint`)}{' '}
                    <Link to={to} className="font-medium text-foreground underline">
                      {t('dashboard.setup.open')}
                    </Link>
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
