import { InboxIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export function EmptyState({ icon: Icon = InboxIcon, title, description, action, className }) {
  const { t } = useTranslation();
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 py-16 text-center', className)}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon size={22} className="text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{title ?? t('common.noData')}</p>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
