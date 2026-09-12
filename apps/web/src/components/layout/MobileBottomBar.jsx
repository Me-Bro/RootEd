import { NavLink } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils.js';

// Fixed shortcut set (not auto-derived from group order) — each entry lists
// its route in priority order, falling back to the self-scoped route when
// the tenant-wide one is filtered out by permission (e.g. student role).
const SHORTCUT_ROUTES = [
  ['/dashboard'],
  ['/academic/students'],
  ['/academic/attendance', '/me/attendance'],
  ['/fee', '/me/fees'],
];

export default function MobileBottomBar({ navGroups, onOpenMenu }) {
  const { t } = useTranslation();
  const allItems = navGroups.flatMap((group) => group.items);
  const primaryTabs = SHORTCUT_ROUTES.map((candidates) =>
    candidates.map((to) => allItems.find((item) => item.to === to)).find(Boolean)
  ).filter(Boolean);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-border bg-card md:hidden">
      {primaryTabs.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) =>
            cn(
              'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium',
              isActive ? 'text-primary' : 'text-muted-foreground'
            )
          }
        >
          <Icon size={20} />
          <span className="w-full truncate px-1 text-center">{label}</span>
        </NavLink>
      ))}
      <button
        onClick={onOpenMenu}
        className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground"
      >
        <Menu size={20} />
        <span className="w-full truncate px-1 text-center">{t('nav.menu')}</span>
      </button>
    </nav>
  );
}
