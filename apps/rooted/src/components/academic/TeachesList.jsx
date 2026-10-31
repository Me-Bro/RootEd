import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/useAuth.js';
import { useTeachingLoad } from '../../hooks/useTeachingLoad.js';
import { classLinks } from '../../utils/teachingLinks.js';

/**
 * What one teacher covers this academic year, for a staff member's page. The read of
 * someone else's load needs staff:read and students:read, so the caller only renders
 * this for users who hold both.
 */
export default function TeachesList({ userId }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canOpenAttendance = (user?.permissions ?? []).includes('attendance:read');
  const { items, isLoading } = useTeachingLoad(userId);

  if (isLoading) return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">{t('staff.detail.teachesEmpty')}</p>;
  }

  return (
    <ul className="flex flex-col gap-1.5 text-sm" data-testid="teaches-list">
      {items.map((item) => {
        const label = `${item.sectionLabel} · ${
          item.subjectName ?? t('academic.myClasses.classTeacher')
        }`;
        return (
          <li key={`${item.sectionId}:${item.subjectId ?? ''}`}>
            {canOpenAttendance ? (
              <Link to={classLinks(item).attendance} className="hover:underline">
                {label}
              </Link>
            ) : (
              label
            )}
          </li>
        );
      })}
    </ul>
  );
}
