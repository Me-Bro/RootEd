import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui/PageHeader.jsx';

export default function OutcomesPage() {
  const { t } = useTranslation();
  return <PageHeader title={t('nav.outcomes')} />;
}
