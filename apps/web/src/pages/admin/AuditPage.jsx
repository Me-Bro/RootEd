import { useTranslation } from 'react-i18next';

export default function AuditPage() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{t('nav.audit')}</h1>
      <p className="text-gray-500">{t('admin.comingSoon')}</p>
    </div>
  );
}
