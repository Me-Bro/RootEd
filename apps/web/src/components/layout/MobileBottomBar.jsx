import { NavLink } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils.js';

export default function MobileBottomBar({ navGroups, onOpenMenu }) {
  const { t } = useTranslation();
  const primaryTabs = navGroups
    .map((group) => group.items[0])
    .filter(Boolean)
    .slice(0, 4);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-border bg-card md:hidden">
      {primaryTabs.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) =>
            cn(
              'flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium',
              isActive ? 'text-primary' : 'text-muted-foreground'
            )
          }
        >
          <Icon size={20} />
          <span className="truncate px-1">{label}</span>
        </NavLink>
      ))}
      <button
        onClick={onOpenMenu}
        className="flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground"
      >
        <Menu size={20} />
        <span>{t('nav.menu')}</span>
      </button>
    </nav>
  );
}
