import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import HelpTopicList from '../../components/help/HelpTopicList.jsx';
import { useHelpTopics } from '../../components/help/useHelpTopics.js';

const GROUPS = ['setup', 'daily'];

export default function HelpPage() {
  const { t } = useTranslation();
  const topics = useHelpTopics();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader title={t('help.title')} description={t('help.description')} />
      {topics.length === 0 && <p className="text-sm text-muted-foreground">{t('help.empty')}</p>}
      {GROUPS.map((group) => {
        const inGroup = topics.filter((x) => x.group === group);
        return (
          inGroup.length > 0 && (
            <section key={group} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold">{t(`help.groups.${group}`)}</h2>
              <HelpTopicList topics={inGroup} />
            </section>
          )
        );
      })}
    </div>
  );
}
