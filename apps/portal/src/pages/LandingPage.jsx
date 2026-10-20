import { useTranslation } from 'react-i18next';
import { LandingHeader } from '@/components/landing/LandingHeader.jsx';
import { Hero } from '@/components/landing/Hero.jsx';
import { ContactBlock } from '@/components/landing/ContactBlock.jsx';

/** The public front door of RR Cloud Career Catalyst. Anyone can read it; nothing here needs a session. */
export default function LandingPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2"
      >
        {t('portal.skipToContent')}
      </a>
      <LandingHeader />
      <main id="main" className="flex-1">
        <Hero />
        <section
          id="request-proposal"
          aria-labelledby="request-proposal-title"
          className="mx-auto max-w-6xl scroll-mt-4 px-4 py-14"
        >
          <h2 id="request-proposal-title" className="text-2xl font-semibold tracking-tight">
            {t('landing.requestProposal')}
          </h2>
          <div className="mt-4">
            <ContactBlock />
          </div>
        </section>
      </main>
    </div>
  );
}
