import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Globe, Mail, MapPin, Phone } from 'lucide-react';
import { hasSeats, unescapeText } from '@rooted/shared/utils';
import api from '../../lib/api.js';
import { useAuth } from '../../contexts/useAuth.js';
import { Card, CardContent } from '../../components/ui/Card.jsx';
import { OrgCode, OrgLogo } from '../../components/org/OrgIdentity.jsx';
import { visibleNavGroups } from '../../components/layout/navigation.js';
import { landsOnDesk } from '../../utils/deskView.js';
import { hasProfileContent, profileToForm } from '../../utils/orgProfile.js';

const isHttp = (url) => /^https?:\/\//i.test(url);

// Who the organization is, and a way into each part of it the signed-in person may
// open. The shortcuts come from the sidebar's own filter, so this page never offers
// a link the nav would hide.
export default function OrgHomePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canEdit = (user?.permissions ?? []).includes('tenant:admin');

  const settings = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => api.get('/tenant/settings').then((r) => r.data),
  });

  if (settings.isLoading) return null;

  const data = settings.data;
  const profile = data?.profile;
  const form = profileToForm(profile);
  const place = [form.city, form.state, form.pincode].filter(Boolean).join(', ');
  const address = [form.line1, form.line2, place, form.country].filter(Boolean).join(', ');

  // One way in per area: the first item of each labelled group the nav shows.
  // Desk staff at a study center are sent from the dashboard to the front desk, so
  // their first shortcut goes to the desk directly.
  const deskUser = landsOnDesk({ seats: hasSeats(user?.orgType), permissions: user?.permissions });
  const start = deskUser
    ? { to: '/desk', label: t('nav.desk') }
    : { to: '/dashboard', label: t('nav.dashboard') };
  const shortcuts = visibleNavGroups(t, user)
    .filter((g) => g.label)
    .map((g) => ({ label: g.label, ...g.items[0] }))
    .filter((s) => s.to !== start.to);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-5 pt-6 sm:flex-row">
          <OrgLogo name={data?.name} logoUrl={profile?.logoUrl} className="h-24 w-24" />
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight break-words">
              {unescapeText(data?.name)}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
              <span>{t('orgProfile.codeLabel')}</span>
              <OrgCode code={data?.orgCode} />
            </div>
            {data?.orgType && (
              <p className="text-sm text-muted-foreground">{t(`org.orgType.${data.orgType}`)}</p>
            )}
            {form.description && (
              <p className="max-w-prose text-sm whitespace-pre-line">{form.description}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {hasProfileContent(profile) ? (
        <Card>
          <CardContent className="grid gap-3 pt-6 text-sm sm:grid-cols-2">
            {address && (
              <Detail icon={MapPin} label={t('orgProfile.addressLabel')} value={address} />
            )}
            {form.phone && (
              <Detail
                icon={Phone}
                label={t('orgProfile.phone')}
                value={form.phone}
                href={`tel:${form.phone.replace(/[^\d+]/g, '')}`}
              />
            )}
            {form.email && (
              <Detail
                icon={Mail}
                label={t('orgProfile.email')}
                value={form.email}
                href={`mailto:${form.email}`}
              />
            )}
            {form.website && (
              <Detail
                icon={Globe}
                label={t('orgProfile.website')}
                value={form.website}
                href={isHttp(form.website) ? form.website : undefined}
                external
              />
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-2 pt-6 text-sm text-muted-foreground">
            <p>{t(canEdit ? 'orgHome.emptyAdmin' : 'orgProfile.emptyMember')}</p>
            {canEdit && (
              <Link to="/tenant/profile" className="w-fit font-medium text-primary hover:underline">
                {t('orgHome.completeProfile')}
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      <section aria-labelledby="org-home-shortcuts" className="flex flex-col gap-3">
        <h2 id="org-home-shortcuts" className="text-sm font-medium text-muted-foreground">
          {t('orgHome.shortcuts')}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Shortcut to={start.to} label={start.label} />
          {shortcuts.map((s) => (
            <Shortcut key={s.to} to={s.to} label={s.label} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Detail({ icon: Icon, label, value, href, external = false }) {
  const content = href ? (
    <a
      href={href}
      className="break-words text-primary hover:underline"
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {value}
    </a>
  ) : (
    <span className="break-words">{value}</span>
  );
  return (
    <div className="flex items-start gap-2">
      <Icon size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="flex min-w-0 flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        {content}
      </div>
    </div>
  );
}

function Shortcut({ to, label }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {label}
      <ArrowRight size={16} className="text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
