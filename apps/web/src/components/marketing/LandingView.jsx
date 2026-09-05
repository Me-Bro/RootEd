import { useTranslation } from 'react-i18next';
import './landing.css';
import {
  HeroDesktopMotif,
  StatementDesktopMotif,
  HeroMobileMotif,
  StatementMobileMotif,
} from './RootMotif.jsx';
import {
  TRIAL_HREF,
  MODULES,
  WHY_ROOTED,
  SECURITY,
  ABOUT_VALUES,
  PROCESS,
  MOBILE_FACTS,
  MOBILE_TAGS,
  PREVIEW_ROLES,
} from './landingContent.js';

function DesktopLanding({ onLoginClick, languageSwitcher, t }) {
  return (
    <div className="lp-desktop-only">
      <nav className="lp-nav">
        <div className="brand">
          <img src="/favicon.svg" alt="RootEd" />
          RootEd
        </div>
        <div className="links">
          <a href="#modules">{t('landing.nav.product')}</a>
          <a href="#security">{t('landing.nav.security')}</a>
          <a href="#about">{t('landing.nav.about')}</a>
          <a href="#contact">{t('landing.nav.contact')}</a>
        </div>
        <div className="cta">
          {languageSwitcher}
          <button type="button" className="btn ghost sm" onClick={onLoginClick}>
            {t('landing.nav.login')}
          </button>
          <a className="btn primary sm" href={TRIAL_HREF}>
            {t('landing.nav.startTrial')}
          </a>
        </div>
      </nav>

      {/* nav / main / footer are kept as siblings, and the hero is a section
          rather than a <header>, so the banner and contentinfo landmarks stay
          top level (axe: landmark-banner-is-top-level,
          landmark-contentinfo-is-top-level). */}
      <main>
        <section className="lp-hero motif-wrap">
          <HeroDesktopMotif
            width={600}
            height={600}
            style={{ right: -80, top: -60, left: 'auto' }}
          />
          <span className="badge dot">{t('landing.hero.badge')}</span>
          {/* Split into two keys rather than using <Trans>, which this
              codebase doesn't use anywhere — the accent clause is the tail of
              the sentence in both languages. */}
          <h1>
            {t('landing.hero.titleMain')}{' '}
            <span className="grad">{t('landing.hero.titleAccent')}</span>
          </h1>
          <p className="lead">{t('landing.hero.lead')}</p>
          <div className="cta-row">
            <a className="btn primary" href={TRIAL_HREF}>
              {t('landing.hero.ctaTrial')}
            </a>
            <button type="button" className="btn secondary" onClick={onLoginClick}>
              {t('landing.hero.ctaLogin')}
            </button>
          </div>
          <p className="fineprint">
            {t('landing.hero.fineprint')}{' '}
            <button type="button" className="btn-inline" onClick={onLoginClick}>
              {t('landing.hero.fineprintLogin')}
            </button>
          </p>

          <div className="lp-mockframe">
            <div className="bar">
              <i></i>
              <i></i>
              <i></i>
            </div>
            <div className="placeholder">
              <div className="role-pills">
                {PREVIEW_ROLES.map((key, i) => (
                  <span className={i === 0 ? 'badge solid' : 'badge'} key={key}>
                    {t(key)}
                  </span>
                ))}
              </div>
              <b>{t('landing.preview.heading')}</b>
              {t('landing.preview.body')}
              <div className="ref">{t('landing.preview.ref')}</div>
            </div>
          </div>
        </section>

        <section className="lp-section on-surface" id="modules">
          <div className="section-head">
            <span className="eyebrow">{t('landing.modulesSection.eyebrow')}</span>
            <h2>{t('landing.modulesSection.heading')}</h2>
            <p>{t('landing.modulesSection.lead')}</p>
          </div>
          <div className="lp-grid">
            {MODULES.map((m) => (
              <div className="lp-card" key={m.titleKey}>
                <div className="icon">{m.icon}</div>
                <h3>{t(m.titleKey)}</h3>
                <p>{t(m.bodyKey)}</p>
              </div>
            ))}
            <div className="lp-card accent">
              <div className="icon">+</div>
              <h3>{t('landing.modulesSection.allConnectedTitle')}</h3>
              <p>{t('landing.modulesSection.allConnectedBody')}</p>
            </div>
          </div>
        </section>

        <section className="lp-section on-dark tight">
          <div className="lp-values-row flush">
            {WHY_ROOTED.map((w) => (
              <div className="lp-value-chip on-dark-chip" key={w.titleKey}>
                <h3>{t(w.titleKey)}</h3>
                <p>{t(w.bodyKey)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-section on-surface" id="security">
          <div className="section-head">
            <span className="eyebrow">{t('landing.securitySection.eyebrow')}</span>
            <h2>{t('landing.securitySection.heading')}</h2>
            <p>{t('landing.securitySection.lead')}</p>
          </div>
          <div>
            {SECURITY.map((s) => (
              <div className="lp-security-row" key={s.num}>
                <span className="num">{s.num}</span>
                <div>
                  <h3>{t(s.titleKey)}</h3>
                  <p>{t(s.bodyKey)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-statement motif-wrap">
          <StatementDesktopMotif
            width={500}
            height={500}
            style={{ left: -100, bottom: -140, top: 'auto' }}
          />
          <blockquote>{t('landing.statement.quote')}</blockquote>
          <cite>{t('landing.statement.cite')}</cite>
        </section>

        <section className="lp-section on-surface" id="about">
          <div className="section-head">
            <span className="eyebrow">{t('landing.aboutSection.eyebrow')}</span>
            <h2>{t('landing.aboutSection.heading')}</h2>
            <p>{t('landing.aboutSection.lead')}</p>
          </div>
          <div className="lp-values-row">
            {ABOUT_VALUES.map((v) => (
              <div className="lp-value-chip" key={v.titleKey}>
                <h3>{t(v.titleKey)}</h3>
                <p>{t(v.bodyKey)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-section on-surface tight">
          <div className="section-head flush">
            <span className="eyebrow">{t('landing.processSection.eyebrow')}</span>
            <h2>{t('landing.processSection.heading')}</h2>
          </div>
          <div className="lp-process">
            {PROCESS.map((step) => (
              <div className="step" key={step.n}>
                <div className="n">{step.n}</div>
                <h3>{t(step.titleKey)}</h3>
                <p>{t(step.bodyKey)}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="lp-cta-band">
          <div>
            <h3>{t('landing.ctaBand.heading')}</h3>
            <p>{t('landing.ctaBand.sub')}</p>
          </div>
          <div className="actions">
            <button type="button" className="btn secondary" onClick={onLoginClick}>
              {t('landing.nav.login')}
            </button>
            <a className="btn primary" href={TRIAL_HREF}>
              {t('landing.nav.startTrial')}
            </a>
          </div>
        </div>
      </main>

      <footer className="lp-footer" id="contact">
        <div className="top">
          <div>
            <div className="brand">
              <img src="/favicon.svg" alt="" />
              RootEd
            </div>
            <p className="blurb">{t('landing.footer.blurb')}</p>
          </div>
          <div className="cols">
            <div>
              <h3>{t('landing.footer.productHeading')}</h3>
              <a href="#modules">{t('landing.footer.modules')}</a>
              <a href="#security">{t('landing.nav.security')}</a>
              <button type="button" onClick={onLoginClick}>
                {t('landing.nav.login')}
              </button>
            </div>
            <div>
              <h3>{t('landing.footer.companyHeading')}</h3>
              <a href="#about">{t('landing.nav.about')}</a>
              <a href="mailto:ruralrootcloud@gmail.com">{t('landing.nav.contact')}</a>
            </div>
          </div>
        </div>
        <div className="bottom">
          <span>{t('landing.footer.copyright')}</span>
          <span>ruralrootcloud@gmail.com</span>
        </div>
      </footer>
    </div>
  );
}

function MobileLanding({ onLoginClick, languageSwitcher, t }) {
  return (
    <div className="lp-mobile-only m-page">
      <nav className="m-nav">
        <div className="brand">
          <img src="/favicon.svg" alt="RootEd" />
          RootEd
        </div>
        {languageSwitcher}
      </nav>

      <main>
        <section className="m-hero motif-wrap">
          <HeroMobileMotif
            width={480}
            height={480}
            style={{ right: -160, top: -30, left: 'auto', opacity: 0.9 }}
          />
          <span className="badge dot">{t('landing.hero.badge')}</span>
          <h1>
            {t('landing.mobile.titleMain')}{' '}
            <span className="grad">{t('landing.mobile.titleAccent')}</span>
          </h1>
          <p>{t('landing.mobile.lead')}</p>
          <a className="btn primary block" href={TRIAL_HREF}>
            {t('landing.hero.ctaTrial')}
          </a>
          <span className="fineprint">
            {t('landing.mobile.fineprint')}{' '}
            <button type="button" className="btn-inline" onClick={onLoginClick}>
              {t('landing.hero.fineprintLogin')}
            </button>
          </span>
        </section>

        <section className="m-section on-dark">
          <span className="eyebrow">{t('landing.mobile.whyEyebrow')}</span>
          <h2>{t('landing.mobile.whyHeading')}</h2>
          {MOBILE_FACTS.map((f) => (
            <div className="m-fact" key={f.num}>
              <span className="ic">{f.num}</span>
              <div>
                <h3>{t(f.titleKey)}</h3>
                <p>{t(f.bodyKey)}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="m-section on-surface">
          <span className="eyebrow">{t('landing.modulesSection.eyebrow')}</span>
          <h2>{t('landing.mobile.modulesHeading')}</h2>
          <div className="m-modgrid">
            {MODULES.map((m) => (
              <div className="m" key={m.titleKey}>
                <div className="icon">{m.icon}</div>
                <span>{t(m.titleKey)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="m-statement motif-wrap">
          <StatementMobileMotif
            width={380}
            height={380}
            style={{ left: -120, bottom: -100, top: 'auto' }}
          />
          <blockquote>{t('landing.statement.quote')}</blockquote>
          <cite>{t('landing.statement.cite')}</cite>
        </section>

        <section className="m-section on-tint">
          <span className="eyebrow">{t('landing.aboutSection.eyebrow')}</span>
          <h2>{t('landing.aboutSection.heading')}</h2>
          <p className="lead flush">{t('landing.mobile.aboutLead')}</p>
          <div className="m-tags">
            {MOBILE_TAGS.map((key) => (
              <span key={key}>{t(key)}</span>
            ))}
          </div>
        </section>

        <section className="m-section on-surface">
          <span className="eyebrow">{t('landing.processSection.eyebrow')}</span>
          <h2>{t('landing.mobile.processHeading')}</h2>
          <div className="m-stepper">
            {PROCESS.map((step) => (
              <div className="m-process-step" key={step.n}>
                <span className="n">{step.n}</span>
                <h3>{t(step.titleKey)}</h3>
                <p>{t(step.bodyKey)}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="m-cta-band">
          <h3>{t('landing.mobile.ctaHeading')}</h3>
          <p>{t('landing.mobile.ctaSub')}</p>
          <a className="btn primary block" href={TRIAL_HREF}>
            {t('landing.nav.startTrial')}
          </a>
        </div>
      </main>

      <footer className="m-footer">
        <div className="brand">RootEd</div>
        <p className="blurb">{t('landing.footer.blurb')}</p>
        <a href="mailto:ruralrootcloud@gmail.com">ruralrootcloud@gmail.com</a>
      </footer>

      <div className="m-sticky-cta">
        <button type="button" className="btn ghost sm" onClick={onLoginClick}>
          {t('landing.nav.login')}
        </button>
        <a className="btn primary sm" href={TRIAL_HREF}>
          {t('landing.nav.startTrial')}
        </a>
      </div>
    </div>
  );
}

/**
 * The approved landing page UI (docs/landing-page-mockup/{desktop,mobile}.html)
 * as a purely presentational component — no auth state, no routing, no
 * redirect logic. It renders both the desktop and mobile trees and lets CSS
 * pick one at the `md` breakpoint (see landing.css), matching how the two
 * mockups were signed off as one responsive page.
 *
 * Copy comes from the `landing` namespace in src/i18n/locales/{en,hi}.json;
 * the "Hindi / English" option is derived from those two by
 * i18n/mergeHiEn.js, so nothing extra is needed for it here.
 *
 * `onLoginClick` is called by every "Log in" CTA; the owning page decides
 * what that means (LoginPage opens the login dialog). `languageSwitcher` is
 * a slot rendered into the nav's right-hand cluster, keeping the language
 * control in the same top-right spot it occupies on the old login screen.
 */
export default function LandingView({ onLoginClick, languageSwitcher }) {
  const { t } = useTranslation();
  return (
    <div className="rooted-landing">
      <DesktopLanding onLoginClick={onLoginClick} languageSwitcher={languageSwitcher} t={t} />
      <MobileLanding onLoginClick={onLoginClick} languageSwitcher={languageSwitcher} t={t} />
    </div>
  );
}
