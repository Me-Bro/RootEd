import { useTranslation } from 'react-i18next';
import { Section } from './Section.jsx';

const ITEMS = ['who', 'length', 'need', 'cost', 'pilot', 'jobs'];

export function Faq() {
  const { t } = useTranslation();
  return (
    <Section id="faq" title={t('landing.faq.title')}>
      <div className="max-w-3xl divide-y divide-border rounded-xl border border-border bg-card">
        {ITEMS.map((key) => (
          <details key={key} className="group px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">
              {t(`landing.faq.items.${key}.q`)}
            </summary>
            <p className="mt-2 text-sm text-muted-foreground">{t(`landing.faq.items.${key}.a`)}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
