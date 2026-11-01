import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import MyClassesList from '../../components/academic/MyClassesList.jsx';

export default function MyClassesPage() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('academic.myClasses.title')}
        description={t('academic.myClasses.description')}
      />
      <MyClassesList />
    </div>
  );
}
