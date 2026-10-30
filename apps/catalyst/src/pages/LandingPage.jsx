import { useTranslation } from 'react-i18next';
import { LandingHeader } from '@/components/landing/LandingHeader.jsx';
import { Hero } from '@/components/landing/Hero.jsx';
import { ForColleges } from '@/components/landing/ForColleges.jsx';
import { HowItWorks } from '@/components/landing/HowItWorks.jsx';
import { Programmes } from '@/components/landing/Programmes.jsx';
import { Outcomes } from '@/components/landing/Outcomes.jsx';
import { ProgressTracking } from '@/components/landing/ProgressTracking.jsx';
import { PlacementProcess } from '@/components/landing/PlacementProcess.jsx';
import { Faq } from '@/components/landing/Faq.jsx';
import { Section } from '@/components/landing/Section.jsx';
import { EnquiryForm } from '@/components/landing/EnquiryForm.jsx';
import { ContactBlock } from '@/components/landing/ContactBlock.jsx';
import { LandingFooter } from '@/components/landing/LandingFooter.jsx';

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
        <ForColleges />
        <HowItWorks />
        <Programmes />
        <Outcomes />
        <ProgressTracking />
        <PlacementProcess />
        <Faq />
        <Section id="request-proposal" tone="muted" title={t('landing.requestProposal')}>
          <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
            <EnquiryForm />
            <ContactBlock />
          </div>
        </Section>
      </main>
      <LandingFooter />
    </div>
  );
}
