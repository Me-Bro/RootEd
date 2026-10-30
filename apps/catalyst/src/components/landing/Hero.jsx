import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function Hero() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="hero-title" className="bg-secondary/60">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <p className="text-xs font-medium tracking-wide text-primary uppercase">
          {t('landing.hero.eyebrow')}
        </p>
        <h1
          id="hero-title"
          className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl"
        >
          {t('landing.hero.title')}
        </h1>
        <p className="mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
          {t('landing.hero.lead')}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="#request-proposal"
            className="inline-flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t('landing.requestProposal')}
          </a>
          <Link
            to="/login"
            className="inline-flex h-11 items-center rounded-lg border border-border bg-card px-5 text-sm font-medium hover:bg-muted"
          >
            {t('landing.signIn')}
          </Link>
        </div>
        <p className="mt-6 max-w-2xl text-xs text-muted-foreground">{t('landing.hero.note')}</p>
      </div>
    </section>
  );
}
