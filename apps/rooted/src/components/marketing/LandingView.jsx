import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link2, Sparkles, Check } from 'lucide-react';
import './landing.css';
import {
  HeroDesktopMotif,
  StatementDesktopMotif,
  HeroMobileMotif,
  StatementMobileMotif,
} from './RootMotif.jsx';
import ContactForm from './ContactForm.jsx';
import PlayBadge from './PlayBadge.jsx';
import { BrowserDashboard, PhonePreview, RolePanel } from './ProductFrames.jsx';
import { brand } from '../../lib/brand.js';
import {
  CONTACT_HREF,
  PARENT_SITE_HREF,
  PLAY_STORE_URL,
  PLAY_QR_SRC,
  MODULES,
  TRUST,
  ROLES,
  WHO,
  ANDROID_POINTS,
  SECURITY,
  FAQ,
  ABOUT_VALUES,
  PROCESS,
  MOBILE_FACTS,
  MOBILE_TAGS,
  PREMIUM_FEATURES,
} from './landingContent.js';

function useIsDesktop(breakpoint = 768) {
  const query = `(min-width: ${breakpoint}px)`;
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e) => setIsDesktop(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return isDesktop;
}

// Android visitors get the app as the primary action on the mobile page;
// everyone else (iPhone, desktop-width browsers) gets the web sign-up.
const IS_ANDROID = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

function TrustStrip({ t }) {
  return (
    <section className="trust" aria-label={t('landing.trust.label')}>
      <ul>
        {TRUST.map((item) => (
          <li key={item.key}>
            <i>
              <item.icon size={15} aria-hidden="true" />
            </i>
            {t(item.key)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RoleTabs({ t }) {
  const [active, setActive] = useState(ROLES[0].id);
  const uid = useId();
  const role = ROLES.find((r) => r.id === active);

  // Arrow keys move between tabs, per the ARIA tabs pattern.
  const onKeyDown = (e) => {
    const i = ROLES.findIndex((r) => r.id === active);
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = ROLES[(i + step + ROLES.length) % ROLES.length].id;
    setActive(next);
    document.getElementById(`${uid}-tab-${next}`)?.focus();
  };

  return (
    <div className="roles">
      <div className="tablist" role="tablist" onKeyDown={onKeyDown}>
        {ROLES.map((r) => (
          <button
            key={r.id}
            id={`${uid}-tab-${r.id}`}
            type="button"
            role="tab"
            aria-selected={r.id === active}
            aria-controls={`${uid}-panel`}
            tabIndex={r.id === active ? 0 : -1}
            onClick={() => setActive(r.id)}
          >
            {t(r.tabKey)}
          </button>
        ))}
      </div>
      <div
        className="panel"
        role="tabpanel"
        id={`${uid}-panel`}
        aria-labelledby={`${uid}-tab-${active}`}
      >
        <div>
          <h3>{t(role.titleKey)}</h3>
          <p>{t(role.bodyKey)}</p>
          <ul>
            {role.pointKeys.map((k) => (
              <li key={k}>{t(k)}</li>
            ))}
          </ul>
        </div>
        <RolePanel id={role.id} t={t} />
      </div>
    </div>
  );
}

function FaqList({ t, className }) {
  return (
    <div className={className}>
      {FAQ.map((item, i) => (
        <details key={item.id} open={i === 0}>
          <summary>{t(item.qKey)}</summary>
          <p>{t(item.aKey)}</p>
        </details>
      ))}
    </div>
  );
}

function DesktopLanding({
  onLoginClick,
  isAuthenticated,
  onDashboardClick,
  onLogoutClick,
  onGetStartedClick,
  languageSwitcher,
  t,
}) {
  const loginLabel = isAuthenticated ? t('landing.nav.dashboard') : t('landing.nav.login');
  const handleLoginClick = isAuthenticated ? onDashboardClick : onLoginClick;

  return (
    <div className="lp-desktop-only">
      <nav className="lp-nav">
        <div className="brand">
          <img src="/favicon.svg" alt="RootEd" />
          RootEd
        </div>
        <div className="links">
          <a href="#roles">{t('landing.nav.product')}</a>
          <a href="#who">{t('landing.nav.who')}</a>
          {PLAY_STORE_URL && <a href="#android">{t('landing.nav.android')}</a>}
          <a href="#security">{t('landing.nav.security')}</a>
          <a href="#pricing">{t('landing.nav.pricing')}</a>
          <a href="#faq">{t('landing.nav.faq')}</a>
          {brand.showStory && <a href="#about">{t('landing.nav.about')}</a>}
          <a href="#contact">{t('landing.nav.contact')}</a>
        </div>
        <div className="cta">
          {languageSwitcher}
          <button type="button" className="btn ghost sm" onClick={handleLoginClick}>
            {loginLabel}
          </button>
          {isAuthenticated ? (
            <button type="button" className="btn primary sm" onClick={onLogoutClick}>
              {t('landing.nav.logout')}
            </button>
          ) : (
            <button type="button" className="btn primary sm" onClick={onGetStartedClick}>
              {t('landing.nav.getStarted')}
            </button>
          )}
        </div>
      </nav>

      {/* nav / main / footer are kept as siblings, and the hero is a section
          rather than a <header>, so the banner and contentinfo landmarks stay
          top level (axe: landmark-banner-is-top-level,
          landmark-contentinfo-is-top-level). */}
      <main>
        <section className="lp-hero v2-hero motif-wrap">
          <HeroDesktopMotif
            width={560}
            height={560}
            style={{ right: -120, top: -80, left: 'auto' }}
          />
          <div>
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
              <button type="button" className="btn primary" onClick={onGetStartedClick}>
                {t('landing.hero.ctaStart')}
              </button>
              {PLAY_STORE_URL ? (
                <PlayBadge t={t} className="on-light" />
              ) : (
                <button type="button" className="btn secondary" onClick={handleLoginClick}>
                  {isAuthenticated ? loginLabel : t('landing.hero.ctaLogin')}
                </button>
              )}
            </div>
            <p className="fineprint">
              {t('landing.hero.fineprint')}{' '}
              <button type="button" className="btn-inline" onClick={handleLoginClick}>
                {isAuthenticated ? loginLabel : t('landing.hero.fineprintLogin')}
              </button>
            </p>
          </div>

          <div className="v2-stage">
            <BrowserDashboard t={t} />
            {PLAY_STORE_URL && <PhonePreview t={t} compact />}
          </div>
        </section>

        <TrustStrip t={t} />

        <section className="lp-section" id="roles">
          <div className="section-head">
            <span className="eyebrow">{t('landing.rolesSection.eyebrow')}</span>
            <h2>{t('landing.rolesSection.heading')}</h2>
            <p>{t('landing.rolesSection.lead')}</p>
          </div>
          <RoleTabs t={t} />
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
                <div className="icon">
                  <m.icon size={22} />
                </div>
                <h3>{t(m.titleKey)}</h3>
                <p>{t(m.bodyKey)}</p>
              </div>
            ))}
            <div className="lp-card accent">
              <div className="icon">
                <Link2 size={22} />
              </div>
              <h3>{t('landing.modulesSection.allConnectedTitle')}</h3>
              <p>{t('landing.modulesSection.allConnectedBody')}</p>
            </div>
          </div>
        </section>

        <section className="lp-section" id="who">
          <div className="section-head">
            <span className="eyebrow">{t('landing.whoSection.eyebrow')}</span>
            <h2>{t('landing.whoSection.heading')}</h2>
            <p>{t('landing.whoSection.lead')}</p>
          </div>
          <div className="lp-grid cols-4">
            {WHO.map((w) => (
              <div className="lp-card" key={w.titleKey}>
                <div className="icon">
                  <w.icon size={22} />
                </div>
                <h3>{t(w.titleKey)}</h3>
                <p>{t(w.bodyKey)}</p>
              </div>
            ))}
          </div>
        </section>

        {PLAY_STORE_URL && (
          <section className="android" id="android">
            <div className="in">
              <div>
                <span className="eyebrow">{t('landing.android.eyebrow')}</span>
                <h2>{t('landing.android.heading')}</h2>
                <p>{t('landing.android.lead')}</p>
                <ul>
                  {ANDROID_POINTS.map((k) => (
                    <li key={k}>
                      <Check size={16} aria-hidden="true" />
                      {t(k)}
                    </li>
                  ))}
                </ul>
                <div className="get">
                  <PlayBadge t={t} />
                  <figure className="qr">
                    <img
                      src={PLAY_QR_SRC}
                      width="104"
                      height="104"
                      alt={t('landing.android.qrAlt')}
                      loading="lazy"
                    />
                    <figcaption>
                      {t('landing.android.qrCaption')}
                      <small>{t('landing.android.qrSub')}</small>
                    </figcaption>
                  </figure>
                </div>
              </div>
              <div className="phones">
                <PhonePreview t={t} />
                <PhonePreview t={t} variant="roll" />
              </div>
            </div>
          </section>
        )}

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
                  <span className="tech">{t(s.techKey)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-section" id="pricing">
          <div className="section-head">
            <span className="eyebrow">{t('landing.pricingSection.eyebrow')}</span>
            <h2>{t('landing.pricingSection.heading')}</h2>
            <p>{t('landing.pricingSection.lead')}</p>
          </div>
          <div className="lp-grid">
            <div className="lp-card accent">
              <div className="icon">
                <Sparkles size={22} />
              </div>
              <h3>{t('landing.pricingSection.freeTitle')}</h3>
              <p>{t('landing.pricingSection.freeBody')}</p>
            </div>
            {PREMIUM_FEATURES.map((f) => (
              <div className="lp-card" key={f.titleKey}>
                <div className="icon">
                  <f.icon size={22} />
                </div>
                <h3>{t(f.titleKey)}</h3>
                <p>{t(f.bodyKey)}</p>
              </div>
            ))}
          </div>
          <p className="fineprint">
            <a className="btn-inline" href={CONTACT_HREF}>
              {t('landing.pricingSection.cta')}
            </a>
          </p>
        </section>

        {brand.showStory && (
          <>
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
          </>
        )}

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

        <section className="lp-section" id="faq">
          <div className="section-head">
            <span className="eyebrow">{t('landing.faqSection.eyebrow')}</span>
            <h2>{t('landing.faqSection.heading')}</h2>
          </div>
          <FaqList t={t} className="faq" />
        </section>

        <div className="lp-cta-band">
          <div>
            <h3>{t('landing.ctaBand.heading')}</h3>
            <p>{t('landing.ctaBand.sub')}</p>
          </div>
          <div className="actions">
            <button type="button" className="btn secondary" onClick={handleLoginClick}>
              {loginLabel}
            </button>
            <button type="button" className="btn primary" onClick={onGetStartedClick}>
              {t('landing.nav.getStarted')}
            </button>
            <PlayBadge t={t} />
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
              <a href="#pricing">{t('landing.nav.pricing')}</a>
              <a href="#security">{t('landing.nav.security')}</a>
              {PLAY_STORE_URL && <a href="#android">{t('landing.footer.androidApp')}</a>}
              <button type="button" onClick={handleLoginClick}>
                {loginLabel}
              </button>
            </div>
            <div>
              <h3>{t('landing.footer.companyHeading')}</h3>
              {brand.showStory && <a href="#about">{t('landing.nav.about')}</a>}
              <a href={`mailto:${brand.contactEmail}`}>{t('landing.nav.contact')}</a>
              <a href={PARENT_SITE_HREF} target="_blank" rel="noopener noreferrer">
                {t('landing.footer.parentSite')}
              </a>
            </div>
            <div>
              <h3>{t('landing.footer.legalHeading')}</h3>
              <a href="/legal/privacy">{t('legal.nav.privacy')}</a>
              <a href="/legal/terms">{t('legal.nav.terms')}</a>
              <a href="/legal/account-deletion">{t('legal.nav.accountDeletion')}</a>
            </div>
            <div>
              <h3>{t('landing.footer.contactForm.heading')}</h3>
              <ContactForm />
            </div>
          </div>
        </div>
        <div className="bottom">
          <span>{t('landing.footer.copyright')}</span>
          <span>{brand.contactEmail}</span>
        </div>
      </footer>
    </div>
  );
}

function MobileLanding({
  onLoginClick,
  isAuthenticated,
  onDashboardClick,
  onLogoutClick,
  onGetStartedClick,
  languageSwitcher,
  t,
}) {
  const loginLabel = isAuthenticated ? t('landing.nav.dashboard') : t('landing.nav.login');
  const handleLoginClick = isAuthenticated ? onDashboardClick : onLoginClick;
  // Play is the primary action only for Android visitors with a published app.
  const appFirst = IS_ANDROID && !!PLAY_STORE_URL;

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
        <section className="m-hero m-hero2 motif-wrap">
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
          <div className="cta-col">
            {appFirst && <PlayBadge t={t} />}
            <button
              type="button"
              className={appFirst ? 'btn secondary block' : 'btn primary block'}
              onClick={onGetStartedClick}
            >
              {appFirst ? t('landing.mobile.getStartedWeb') : t('landing.hero.ctaStart')}
            </button>
          </div>
          <span className="fineprint">
            {t('landing.mobile.fineprint')}{' '}
            <button type="button" className="btn-inline" onClick={handleLoginClick}>
              {isAuthenticated ? loginLabel : t('landing.hero.fineprintLogin')}
            </button>
          </span>
          {PLAY_STORE_URL && (
            <div className="peek">
              <PhonePreview t={t} compact />
            </div>
          )}
        </section>

        <div className="m-chips" aria-label={t('landing.trust.label')}>
          {TRUST.map((item) => (
            <span key={item.key}>{t(item.key)}</span>
          ))}
        </div>

        <section className="m-section on-tint">
          <span className="eyebrow">{t('landing.rolesSection.eyebrow')}</span>
          <h2>{t('landing.mobile.rolesHeading')}</h2>
          <div className="m-roles">
            {ROLES.map((r) => (
              <article key={r.id}>
                <h3>{t(r.tabKey)}</h3>
                <p>{t(r.titleKey)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="m-section on-surface">
          <span className="eyebrow">{t('landing.modulesSection.eyebrow')}</span>
          <h2>{t('landing.mobile.modulesHeading')}</h2>
          <div className="m-modgrid">
            {MODULES.map((m) => (
              <div className="m" key={m.titleKey}>
                <div className="icon">
                  <m.icon size={24} />
                </div>
                <span>{t(m.titleKey)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="m-section on-surface flush-top">
          <span className="eyebrow">{t('landing.whoSection.eyebrow')}</span>
          <h2>{t('landing.mobile.whoHeading')}</h2>
          <div className="m-who">
            {WHO.map((w) => (
              <div key={w.titleKey}>
                <h3>{t(w.titleKey)}</h3>
                <span>{t(w.bodyKey)}</span>
              </div>
            ))}
          </div>
        </section>

        {PLAY_STORE_URL && (
          <section className="m-section on-dark m-app" id="android">
            <span className="eyebrow">{t('landing.android.eyebrow')}</span>
            <h2>{t('landing.android.heading')}</h2>
            <p>{t('landing.mobile.appLead')}</p>
            <PlayBadge t={t} />
          </section>
        )}

        <section className="m-section on-surface">
          <span className="eyebrow">{t('landing.securitySection.eyebrow')}</span>
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

        <section className="m-section on-tint" id="pricing">
          <span className="eyebrow">{t('landing.pricingSection.eyebrow')}</span>
          <h2>{t('landing.mobile.pricingHeading')}</h2>
          <p className="lead">{t('landing.mobile.pricingLead')}</p>
          <div className="m-fact">
            <span className="ic">
              <Sparkles size={18} />
            </span>
            <div>
              <h3>{t('landing.pricingSection.freeTitle')}</h3>
              <p>{t('landing.pricingSection.freeBody')}</p>
            </div>
          </div>
          {PREMIUM_FEATURES.map((f) => (
            <div className="m-fact" key={f.titleKey}>
              <span className="ic">
                <f.icon size={18} />
              </span>
              <div>
                <h3>{t(f.titleKey)}</h3>
                <p>{t(f.bodyKey)}</p>
              </div>
            </div>
          ))}
          <a className="btn-inline" href={CONTACT_HREF}>
            {t('landing.mobile.pricingCta')}
          </a>
        </section>

        {brand.showStory && (
          <>
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
          </>
        )}

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

        <section className="m-section on-surface m-faq flush-top" id="faq">
          <span className="eyebrow">{t('landing.faqSection.eyebrow')}</span>
          <h2>{t('landing.faqSection.mobileHeading')}</h2>
          <FaqList t={t} />
        </section>

        <div className="m-cta-band">
          <h3>{t('landing.mobile.ctaHeading')}</h3>
          <p>{t('landing.mobile.ctaSub')}</p>
          <button type="button" className="btn primary block" onClick={onGetStartedClick}>
            {t('landing.nav.getStarted')}
          </button>
        </div>
      </main>

      <footer className="m-footer">
        <div className="brand">RootEd</div>
        <p className="blurb">{t('landing.footer.blurb')}</p>
        <a href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a>
        <a href={PARENT_SITE_HREF} target="_blank" rel="noopener noreferrer">
          {t('landing.footer.parentSite')}
        </a>
        <div className="m-contact">
          <ContactForm />
        </div>
        <div className="m-legal">
          <a href="/legal/privacy">{t('legal.nav.privacy')}</a>
          <a href="/legal/terms">{t('legal.nav.terms')}</a>
          <a href="/legal/account-deletion">{t('legal.nav.accountDeletion')}</a>
        </div>
      </footer>

      <div className="m-sticky-cta">
        <button type="button" className="btn ghost sm" onClick={handleLoginClick}>
          {loginLabel}
        </button>
        {isAuthenticated ? (
          <button type="button" className="btn primary sm" onClick={onLogoutClick}>
            {t('landing.nav.logout')}
          </button>
        ) : appFirst ? (
          <PlayBadge t={t} />
        ) : (
          <button type="button" className="btn primary sm" onClick={onGetStartedClick}>
            {t('landing.nav.getStarted')}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The landing page UI (docs/landing-page-mockup/{desktop,mobile}-v2.html),
 * still no routing/redirect logic of its own — it mounts only the desktop or
 * mobile tree, switching at the same `md` (768px) breakpoint the rest of the
 * app uses (see `useIsDesktop` above), avoiding paying for both trees'
 * DOM/assets on every load.
 *
 * Copy comes from the `landing` namespace in src/i18n/locales/{en,hi}.json;
 * the "Hindi / English" option is derived from those two by
 * i18n/mergeHiEn.js, so nothing extra is needed for it here.
 *
 * `onLoginClick` is called by every "Log in" CTA when `isAuthenticated` is
 * false; the owning page decides what that means (HomePage opens the login
 * dialog). `onGetStartedClick` is called by every "Get started free" CTA the
 * same way — HomePage routes it to `/register` (RootEd is free, no signup
 * gate). When `isAuthenticated` is true, all of those CTAs relabel to
 * "Dashboard" and call `onDashboardClick` instead, and the nav/mobile-sticky
 * button clusters additionally swap their "Get started" slot for a "Log out"
 * button calling `onLogoutClick`. `languageSwitcher` is a slot rendered into
 * the nav's right-hand cluster, keeping the language control in the same
 * top-right spot it occupies on the old login screen.
 *
 * Play badge, QR code and the Android band render only for brands with a
 * `playStoreUrl` (lib/brand.js).
 */
export default function LandingView({
  onLoginClick,
  isAuthenticated = false,
  onDashboardClick,
  onLogoutClick,
  onGetStartedClick,
  languageSwitcher,
}) {
  const { t } = useTranslation();
  const isDesktop = useIsDesktop();
  const shared = {
    onLoginClick,
    isAuthenticated,
    onDashboardClick,
    onLogoutClick,
    onGetStartedClick,
    languageSwitcher,
    t,
  };
  return (
    <div className="rooted-landing">
      {isDesktop ? <DesktopLanding {...shared} /> : <MobileLanding {...shared} />}
    </div>
  );
}
