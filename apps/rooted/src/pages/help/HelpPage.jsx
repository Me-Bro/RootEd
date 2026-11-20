import { useTranslation } from 'react-i18next';
import { hasSeats } from '@rooted/shared/utils';
import { useAuth } from '../../contexts/useAuth.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import HelpTopicList from '../../components/help/HelpTopicList.jsx';
import SupportForm from '../../components/help/SupportForm.jsx';
import { useHelpTopics } from '../../components/help/useHelpTopics.js';

const GROUPS = ['setup', 'daily'];

export default function HelpPage() {
  const { t } = useTranslation();
  const topics = useHelpTopics();
  const { user } = useAuth();
  const seats = hasSeats(user?.orgType);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader title={t('help.title')} description={t('help.description')} />
      {topics.length === 0 && <p className="text-sm text-muted-foreground">{t('help.empty')}</p>}
      {GROUPS.map((group) => {
        const inGroup = topics.filter((x) => x.group === group);
        return (
          inGroup.length > 0 && (
            <section key={group} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold">
                {t(`help.groups.${group === 'setup' && seats ? 'setupCentre' : group}`)}
              </h2>
              <HelpTopicList topics={inGroup} />
            </section>
          )
        );
      })}
      {/* Every role, including ones with no topics above: the topics are gated by
          permission, contacting support is not. */}
      <section id="contact-support" className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">{t('help.support.heading')}</h2>
        <p className="text-sm text-muted-foreground">{t('help.support.description')}</p>
        <SupportForm />
      </section>
    </div>
  );
}
