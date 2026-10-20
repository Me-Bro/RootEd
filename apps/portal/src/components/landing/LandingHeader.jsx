import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Wordmark } from './Wordmark.jsx';

const LINKS = [
  ['how-it-works', 'howItWorks'],
  ['programmes', 'programmes'],
  ['placement', 'placement'],
  ['faq', 'faq'],
];

const linkClass = 'inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium';

export function LandingHeader() {
  const { t } = useTranslation();
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link to="/" aria-label={t('portal.brand')}>
          <Wordmark />
        </Link>
        <nav
          aria-label={t('landing.nav.label')}
          className="order-last w-full sm:order-none sm:w-auto"
        >
          <ul className="flex gap-1 overflow-x-auto">
            {LINKS.map(([id, key]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className={`${linkClass} whitespace-nowrap text-muted-foreground hover:text-foreground`}
                >
                  {t(`landing.nav.${key}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link to="/login" className={`${linkClass} border border-border hover:bg-muted`}>
            {t('landing.signIn')}
          </Link>
          <a
            href="#request-proposal"
            className={`${linkClass} bg-primary text-primary-foreground hover:bg-primary/90`}
          >
            {t('landing.requestProposal')}
          </a>
        </div>
      </div>
    </header>
  );
}
