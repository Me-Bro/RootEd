import { useTranslation } from 'react-i18next';
import { Section } from './Section.jsx';
import { Badge } from '@/components/ui/Badge.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card.jsx';

// No prices on the page: fees are quoted per college, in the proposal.
const PROGRAMMES = ['skill_builder', 'career_ready', 'campus_partner'];

export function Programmes() {
  const { t } = useTranslation();
  return (
    <Section
      id="programmes"
      title={t('landing.programmes.title')}
      lead={t('landing.programmes.lead')}
    >
      <ul className="grid gap-4 md:grid-cols-3">
        {PROGRAMMES.map((key) => (
          <li key={key}>
            <Card className="h-full">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle as="h3">{t(`landing.programmes.items.${key}.name`)}</CardTitle>
                  {key === 'career_ready' && (
                    <Badge variant="info">{t('landing.programmes.core')}</Badge>
                  )}
                </div>
                <p className="text-xs font-medium text-muted-foreground">
                  {t(`landing.programmes.items.${key}.meta`)}
                </p>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {t(`landing.programmes.items.${key}.body`)}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-muted-foreground">{t('landing.programmes.note')}</p>
    </Section>
  );
}
