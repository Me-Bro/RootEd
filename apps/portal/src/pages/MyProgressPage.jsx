import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui/PageHeader.jsx';

export default function MyProgressPage() {
  const { t } = useTranslation();
  return <PageHeader title={t('me.progressTitle')} description={t('me.placeholder')} />;
}
