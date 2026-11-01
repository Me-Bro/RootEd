import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CircleHelp } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../ui/sheet.jsx';
import { topicsForPath } from '../../utils/helpTopics.js';
import HelpTopicList from './HelpTopicList.jsx';
import { useHelpTopics } from './useHelpTopics.js';

/** Header "?" button. The drawer lists this page's topics first, already open. */
export default function HelpDrawer() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const topics = useHelpTopics();
  if (topics.length === 0) return null;

  const { here, rest } = topicsForPath(topics, pathname);
  const close = () => setOpen(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-2 rounded-md hover:bg-muted text-muted-foreground"
        aria-label={t('help.button')}
      >
        <CircleHelp size={18} />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t('help.title')}</SheetTitle>
            <SheetDescription>{t('help.drawerDescription')}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 pb-4">
            {here.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('help.onThisPage')}
                </h3>
                <HelpTopicList topics={here} openKeys={here.map((x) => x.key)} onNavigate={close} />
              </section>
            )}
            {rest.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {here.length > 0 ? t('help.otherTopics') : t('help.allTopics')}
                </h3>
                <HelpTopicList topics={rest} onNavigate={close} />
              </section>
            )}
            <Link to="/help" onClick={close} className="w-fit text-sm font-medium underline">
              {t('help.seeAll')}
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
