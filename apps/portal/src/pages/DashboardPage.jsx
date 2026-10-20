import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui/PageHeader.jsx';

export default function DashboardPage() {
  const { t } = useTranslation();
  return <PageHeader title={t('dashboard.title')} description={t('dashboard.placeholder')} />;
}
