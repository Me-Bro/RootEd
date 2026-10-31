import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/useAuth.js';
import { EmptyState } from '../ui/EmptyState.jsx';

const FIX_PAGE = {
  sections: '/academic/classes-sections',
  terms: '/academic/years',
  subjects: '/academic/subjects',
};

/**
 * Empty state for a missing prerequisite ('sections' | 'terms' | 'subjects'). Admins get a
 * link to the page that fixes it; everyone else is told to ask one, since those pages are
 * admin-only.
 */
export default function SetupGap({ gap }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = (user?.permissions ?? []).includes('tenant:admin');
  const hint = t(`academic.setupGap.${gap}.hint`);

  return (
    <EmptyState
      title={t(`academic.setupGap.${gap}.title`)}
      description={isAdmin ? hint : `${hint} ${t('academic.setupGap.askAdmin')}`}
      action={
        isAdmin && (
          <Link to={FIX_PAGE[gap]} className="text-sm font-medium underline">
            {t(`academic.setupGap.${gap}.link`)}
          </Link>
        )
      }
    />
  );
}
