import { useTranslation } from 'react-i18next';
import { Section } from './Section.jsx';

const STEPS = ['baseline', 'fullstack', 'practices', 'project', 'ai', 'career'];

export function HowItWorks() {
  const { t } = useTranslation();
  return (
    <Section
      id="how-it-works"
      tone="muted"
      title={t('landing.howItWorks.title')}
      lead={t('landing.howItWorks.lead')}
    >
      <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((key, i) => (
          <li key={key} className="flex gap-3 rounded-xl border border-border bg-card p-4">
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
            >
              {i + 1}
            </span>
            <div>
              <h3 className="text-base font-semibold">
                {t(`landing.howItWorks.steps.${key}.title`)}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(`landing.howItWorks.steps.${key}.body`)}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-sm text-muted-foreground">{t('landing.howItWorks.note')}</p>
    </Section>
  );
}
