import { useTranslation } from 'react-i18next';
import { AlertTriangle, FileQuestion, Lock, PowerOff } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Button, buttonVariants } from '../ui/Button.jsx';

const KINDS = {
  notFound: { icon: FileQuestion, title: 'common.notFoundTitle', body: 'common.notFoundBody' },
  noAccess: { icon: Lock, title: 'common.noAccessTitle', body: 'common.noAccessBody' },
  moduleOff: { icon: PowerOff, title: 'common.moduleOffTitle', body: 'common.moduleOffBody' },
  crash: { icon: AlertTriangle, title: 'common.crashTitle', body: 'common.crashBody' },
};

/**
 * Shown in place of a page the user cannot see, instead of a blank screen or a
 * silent bounce to /dashboard. The dashboard link is a plain <a>: the crash
 * fallback also renders outside the router.
 */
export function RouteStatus({ kind }) {
  const { t } = useTranslation();
  const { icon, title, body } = KINDS[kind];
  return (
    <EmptyState
      icon={icon}
      title={t(title)}
      description={t(body)}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          {kind === 'crash' && (
            <Button onClick={() => window.location.reload()}>{t('common.reload')}</Button>
          )}
          <a
            href="/dashboard"
            className={buttonVariants({ variant: kind === 'crash' ? 'outline' : 'default' })}
          >
            {t('common.goToDashboard')}
          </a>
        </div>
      }
    />
  );
}
