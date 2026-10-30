import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Wordmark } from './Wordmark.jsx';

export function LandingFooter() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground">
        <div className="flex flex-col gap-1">
          <Wordmark />
          <p className="text-xs">{t('landing.footer.by')}</p>
        </div>
        <Link to="/login" className="underline">
          {t('landing.signIn')}
        </Link>
      </div>
    </footer>
  );
}
