import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';

/** Collapsible "How do I…" topics: title, numbered steps, and a link to the screen. */
export default function HelpTopicList({ topics, openKeys = [], onNavigate }) {
  const { t } = useTranslation();
  return (
    <ul className="flex flex-col gap-2">
      {topics.map(({ key, steps, to }) => (
        <li key={key} className="rounded-md border border-border bg-card">
          <details open={openKeys.includes(key)} className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                aria-hidden="true"
              />
              {t(`help.topics.${key}.title`)}
            </summary>
            <div className="flex flex-col gap-2 px-3 pb-3 pl-9 text-sm">
              <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
                {Array.from({ length: steps }, (_, i) => (
                  <li key={i}>{t(`help.topics.${key}.step${i + 1}`)}</li>
                ))}
              </ol>
              <Link
                to={to}
                onClick={onNavigate}
                className="w-fit font-medium text-foreground underline"
              >
                {t('help.open')}
              </Link>
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
