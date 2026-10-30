import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Building2, Check, ChevronDown, Plus } from 'lucide-react';
import { useAuth } from '../../contexts/useAuth.js';
import { Button } from '../ui/Button.jsx';

/**
 * Which organization the session is currently in, and how to leave it.
 *
 * Shown persistently rather than hidden behind a menu: with multi-org
 * membership the failure mode is a teacher entering marks into the wrong
 * school, and a name they have to go looking for does not prevent that.
 */
export default function OrgSwitcher() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, selectTenant } = useAuth();
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState(null);

  const orgs = user?.orgs ?? [];
  const current = orgs.find((o) => o._id === user?.tenantId);

  // A super_admin reaches tenants by impersonation, never by membership, so
  // there is nothing here for them to switch between.
  if (user?.systemRole === 'super_admin') return null;
  if (!current && orgs.length === 0) return null;

  async function choose(tenantId) {
    if (tenantId === user?.tenantId) {
      setOpen(false);
      return;
    }
    setPendingId(tenantId);
    try {
      await selectTenant(tenantId);
      setOpen(false);
      // Land on the dashboard rather than whatever page was open: the current
      // route may not exist for this organization's modules or the caller's
      // roles in it.
      navigate('/dashboard');
    } finally {
      setPendingId(null);
    }
  }

  const label = current?.name ?? t('org.noOrganization');

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="max-w-[12rem] gap-1.5 px-2 sm:max-w-xs sm:px-2.5"
      >
        <Building2 size={15} className="shrink-0" />
        <span className="truncate text-sm font-medium">{label}</span>
        <ChevronDown size={14} className="shrink-0 opacity-60" />
      </Button>

      {open && (
        <>
          {/* Click-away. Keyboard users get Escape via the menu itself. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
            className="absolute right-0 z-50 mt-1 w-64 rounded-lg border border-border bg-card p-1 shadow-lg"
          >
            <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              {t('org.yourOrganizations')}
            </p>

            {orgs.map((org) => (
              <button
                key={org._id}
                type="button"
                role="menuitem"
                disabled={pendingId !== null}
                onClick={() => choose(org._id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent disabled:opacity-60"
              >
                <Check
                  size={14}
                  className={org._id === user?.tenantId ? 'opacity-100' : 'opacity-0'}
                />
                <span className="truncate">
                  {pendingId === org._id ? t('auth.entering') : org.name}
                </span>
              </button>
            ))}

            <div className="my-1 h-px bg-border" />

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigate('/orgs/new');
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
            >
              <Plus size={14} />
              {t('org.createOrganization')}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigate('/orgs/join');
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
            >
              <Building2 size={14} />
              {t('org.joinOrganization')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
