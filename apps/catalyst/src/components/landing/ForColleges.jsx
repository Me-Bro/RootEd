import { useTranslation } from 'react-i18next';
import { Section } from './Section.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card.jsx';

const ITEMS = ['trainers', 'projects', 'reports'];

export function ForColleges() {
  const { t } = useTranslation();
  return (
    <Section
      id="for-colleges"
      title={t('landing.forColleges.title')}
      lead={t('landing.forColleges.lead')}
    >
      <ul className="grid gap-4 md:grid-cols-3">
        {ITEMS.map((key) => (
          <li key={key}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle as="h3">{t(`landing.forColleges.items.${key}.title`)}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {t(`landing.forColleges.items.${key}.body`)}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}
