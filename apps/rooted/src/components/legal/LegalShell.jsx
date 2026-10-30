import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcherTrigger } from '../ui/LanguageSwitcher.jsx';
import { LAST_UPDATED } from './legalContent.js';

/**
 * Renders a section's `body`: blank lines become paragraphs, and a run of
 * lines starting with "- " becomes a list. Deliberately not Markdown — these
 * pages need exactly two shapes, and a parser would be a dependency and an
 * injection surface for no gain.
 */
function SectionBody({ text }) {
  const blocks = text.split('\n\n').filter(Boolean);
  return blocks.map((block, i) => {
    const lines = block.split('\n');
    if (lines.every((line) => line.startsWith('- '))) {
      return (
        <ul key={i} className="ml-5 list-disc space-y-1 text-sm leading-relaxed text-foreground">
          {lines.map((line, j) => (
            <li key={j}>{line.slice(2)}</li>
          ))}
        </ul>
      );
    }
    return (
      <p key={i} className="text-sm leading-relaxed text-foreground">
        {block}
      </p>
    );
  });
}

/**
 * Shared chrome for /legal/*. These pages must stay reachable without signing
 * in: Google Play requires the privacy policy and the data-deletion URL to be
 * publicly accessible, and a reviewer checks them before they ever have an
 * account.
 */
export default function LegalShell({ titleKey, introKey, sectionsKey, sections }) {
  const { t } = useTranslation();

  return (
    <div role="main" className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <div className="flex items-start justify-between gap-4">
          <Link to="/login" className="flex items-center gap-3">
            <img src="/favicon.svg" alt="" width={32} height={30} />
            <span className="text-lg font-semibold tracking-tight text-foreground">RootEd</span>
          </Link>
          <LanguageSwitcherTrigger />
        </div>

        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t(titleKey)}</h1>
          <p className="text-xs text-muted-foreground">
            {t('legal.lastUpdated', { date: LAST_UPDATED })}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">{t(introKey)}</p>
        </header>

        <div className="flex flex-col gap-6">
          {sections.map((key) => (
            <section key={key} className="flex flex-col gap-2">
              <h2 className="text-base font-semibold text-foreground">
                {t(`${sectionsKey}.${key}.title`)}
              </h2>
              <SectionBody text={t(`${sectionsKey}.${key}.body`)} />
            </section>
          ))}
        </div>

        <footer className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-6 text-sm">
          <Link to="/legal/privacy" className="text-muted-foreground hover:text-foreground">
            {t('legal.nav.privacy')}
          </Link>
          <Link to="/legal/terms" className="text-muted-foreground hover:text-foreground">
            {t('legal.nav.terms')}
          </Link>
          <Link
            to="/legal/account-deletion"
            className="text-muted-foreground hover:text-foreground"
          >
            {t('legal.nav.accountDeletion')}
          </Link>
          <Link to="/login" className="text-muted-foreground hover:text-foreground">
            {t('legal.nav.backToSite')}
          </Link>
        </footer>
      </div>
    </div>
  );
}
