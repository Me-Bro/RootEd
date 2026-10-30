import { useTranslation } from 'react-i18next';
import { TRAINING_TARGETS } from '@rooted/shared/constants';
import { Section } from './Section.jsx';

// The numbers come from the same constant the portal's dashboard measures against.
const TARGETS = ['attendance', 'completion', 'project', 'mockInterview'];
const ALSO = ['improvement', 'placement'];

export function Outcomes() {
  const { t } = useTranslation();
  return (
    <Section
      id="outcomes"
      tone="muted"
      title={t('landing.outcomes.title')}
      lead={t('landing.outcomes.lead')}
    >
      <dl className="grid gap-4 sm:grid-cols-2">
        {TARGETS.map((key) => (
          <div key={key} className="rounded-xl border border-border bg-card p-4">
            <dt className="text-sm text-muted-foreground">
              {t(`landing.outcomes.items.${key}.label`)}
            </dt>
            <dd className="mt-1 text-lg font-semibold">
              {t(`landing.outcomes.items.${key}.value`, { target: TRAINING_TARGETS[key] })}
            </dd>
          </div>
        ))}
        {ALSO.map((key) => (
          <div key={key} className="rounded-xl border border-border bg-card p-4">
            <dt className="text-sm text-muted-foreground">
              {t(`landing.outcomes.also.${key}.label`)}
            </dt>
            <dd className="mt-1 text-lg font-semibold">
              {t(`landing.outcomes.also.${key}.value`)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 text-sm text-muted-foreground">{t('landing.outcomes.note')}</p>
    </Section>
  );
}
