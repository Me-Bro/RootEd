import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Section } from './Section.jsx';

const ITEMS = ['attendance', 'projects', 'improvement', 'placement', 'completion', 'report'];

export function ProgressTracking() {
  const { t } = useTranslation();
  return (
    <Section id="progress" title={t('landing.progress.title')} lead={t('landing.progress.lead')}>
      <ul className="grid gap-3 sm:grid-cols-2">
        {ITEMS.map((key) => (
          <li key={key} className="flex gap-2 text-sm">
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            <span>{t(`landing.progress.items.${key}`)}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
