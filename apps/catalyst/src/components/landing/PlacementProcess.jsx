import { useTranslation } from 'react-i18next';
import { Section } from './Section.jsx';

const STEPS = ['assess', 'prepare', 'test', 'match', 'coordinate', 'track', 'report'];

export function PlacementProcess() {
  const { t } = useTranslation();
  return (
    <Section
      id="placement"
      tone="muted"
      title={t('landing.placement.title')}
      lead={t('landing.placement.lead')}
    >
      <ol className="grid gap-3 md:grid-cols-2">
        {STEPS.map((key, i) => (
          <li key={key} className="flex gap-3 text-sm">
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
            >
              {i + 1}
            </span>
            <span>{t(`landing.placement.steps.${key}`)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-sm text-muted-foreground">{t('landing.placement.network')}</p>
      <p className="mt-2 text-sm font-medium">{t('landing.disclaimer')}</p>
    </Section>
  );
}
