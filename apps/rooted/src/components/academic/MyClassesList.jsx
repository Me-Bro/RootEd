import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GraduationCap } from 'lucide-react';
import { Card, CardContent } from '../ui/Card.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { useAuth } from '../../contexts/useAuth.js';
import { useTeachingLoad } from '../../hooks/useTeachingLoad.js';
import { classLinks } from '../../utils/teachingLinks.js';

const linkCls = 'rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted';

/** The signed-in teacher's own classes, each with buttons into Attendance, Grades and Students. */
export default function MyClassesList() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const perms = user?.permissions ?? [];
  const { items, yearId, isLoading } = useTeachingLoad();

  if (isLoading) return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;

  if (!items.length) {
    const noYear = yearId === null;
    return (
      <EmptyState
        icon={GraduationCap}
        title={t(noYear ? 'academic.myClasses.noYearTitle' : 'academic.myClasses.emptyTitle')}
        description={t(noYear ? 'academic.myClasses.noYearHint' : 'academic.myClasses.emptyHint')}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="my-classes">
      {items.map((item) => {
        const links = classLinks(item);
        return (
          <Card key={`${item.sectionId}:${item.subjectId ?? ''}`}>
            <CardContent className="flex flex-col gap-3">
              <div>
                <p className="text-sm font-semibold">
                  {item.subjectName ?? t('academic.myClasses.classTeacher')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.sectionLabel}
                  {item.periodsPerWeek > 0 &&
                    ` · ${t('academic.myClasses.periodsPerWeek', { count: item.periodsPerWeek })}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {perms.includes('attendance:read') && (
                  <Link to={links.attendance} className={linkCls}>
                    {t('academic.myClasses.attendance')}
                  </Link>
                )}
                {perms.includes('grades:read') && (
                  <Link to={links.grades} className={linkCls}>
                    {t('academic.myClasses.grades')}
                  </Link>
                )}
                {perms.includes('students:read') && (
                  <Link to={links.students} className={linkCls}>
                    {t('academic.myClasses.students')}
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
