import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, Trash2 } from 'lucide-react';
import { unescapeText } from '@rooted/shared/utils';
import api from '../../lib/api.js';
import { useAuth } from '../../contexts/useAuth.js';
import { Card, CardContent } from '../../components/ui/Card.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { OrgCode, OrgLogo } from '../../components/org/OrgIdentity.jsx';
import { apiError } from '../../utils/studyCenter.js';
import { checkLogoFile } from '../../utils/reportCardSettings.js';
import { formToPayload, hasProfileContent, profileToForm } from '../../utils/orgProfile.js';

// Read by every member, edited only by tenant:admin. The server decides what a
// member may see (the registration number is admin-only), so this page just
// renders whatever came back.
export default function OrgProfilePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user, refreshUser } = useAuth();
  const fileRef = useRef(null);
  const canEdit = (user?.permissions ?? []).includes('tenant:admin');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  // Edits layered over the server's answer: a refetch neither reverts what was
  // typed nor is hidden by it (same approach as the report card settings).
  const [edits, setEdits] = useState({});

  const settings = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => api.get('/tenant/settings').then((r) => r.data),
  });
  const data = settings.data;
  const profile = data?.profile;
  const form = { name: unescapeText(data?.name ?? ''), ...profileToForm(profile), ...edits };
  const change = (patch) => {
    setSaved(false);
    setEdits((e) => ({ ...e, ...patch }));
  };
  const field = (key, label, extra = {}) => (
    <Input
      id={`org-${key}`}
      label={label}
      value={form[key]}
      onChange={(e) => change({ [key]: e.target.value })}
      {...extra}
    />
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });

  const save = useMutation({
    mutationFn: () => {
      const name = form.name.trim();
      return api.patch('/tenant/settings', {
        ...(name ? { name } : {}),
        profile: formToPayload(form, { admin: canEdit }),
      });
    },
    onSuccess: async () => {
      setError('');
      setSaved(true);
      setEdits({});
      refresh();
      // The dropdown reads the org name from /auth/me.
      await refreshUser();
    },
    onError: (err) => {
      setSaved(false);
      setError(apiError(err, t('orgProfile.saveFailed')));
    },
  });

  const uploadLogo = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('logo', file);
      return api.post('/tenant/profile/logo', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      setError('');
      refresh();
    },
    // The text fields are a separate request, so a failed logo never loses them.
    onError: (err) => setError(apiError(err, t('orgProfile.logoUploadFailed'))),
  });

  const removeLogo = useMutation({
    mutationFn: () => api.delete('/tenant/profile/logo'),
    onSuccess: () => {
      setError('');
      refresh();
    },
    onError: (err) => setError(apiError(err, t('orgProfile.logoRemoveFailed'))),
  });

  const onPickLogo = (file) => {
    if (!file) return;
    const problem = checkLogoFile(file);
    if (problem === 'type') return setError(t('orgProfile.logoBadType'));
    if (problem === 'size') return setError(t('orgProfile.logoTooBig'));
    uploadLogo.mutate(file);
  };

  if (settings.isLoading) return null;

  const address = [
    form.line1,
    form.line2,
    [form.city, form.state, form.pincode].filter(Boolean).join(', '),
    form.country,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('orgProfile.title')} description={t('orgProfile.description')} />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center">
          <OrgLogo name={data?.name} logoUrl={profile?.logoUrl} className="h-20 w-20" />
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-xl font-semibold break-words">{unescapeText(data?.name)}</h2>
            <div className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
              <span>{t('orgProfile.codeLabel')}</span>
              <OrgCode code={data?.orgCode} />
            </div>
            {data?.orgType && (
              <p className="text-sm text-muted-foreground">{t(`org.orgType.${data.orgType}`)}</p>
            )}
          </div>
          {canEdit && (
            <div className="flex gap-2 sm:ml-auto">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg"
                className="sr-only"
                aria-label={t('orgProfile.logoFile')}
                onChange={(e) => {
                  onPickLogo(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={uploadLogo.isPending}
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={14} />
                {t('orgProfile.uploadLogo')}
              </Button>
              {profile?.logoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={removeLogo.isPending}
                  onClick={() => removeLogo.mutate()}
                >
                  <Trash2 size={14} />
                  {t('orgProfile.removeLogo')}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {canEdit ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Card>
            <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
              {field('name', t('orgProfile.name'), { maxLength: 100, required: true })}
              {field('registrationNumber', t('orgProfile.registrationNumber'), { maxLength: 60 })}
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="org-description">{t('orgProfile.descriptionLabel')}</Label>
                <textarea
                  id="org-description"
                  value={form.description}
                  onChange={(e) => change({ description: e.target.value })}
                  maxLength={1000}
                  rows={4}
                  className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
              {field('line1', t('orgProfile.line1'), { maxLength: 200 })}
              {field('line2', t('orgProfile.line2'), { maxLength: 200 })}
              {field('city', t('orgProfile.city'), { maxLength: 120 })}
              {field('state', t('orgProfile.state'), { maxLength: 120 })}
              {field('pincode', t('orgProfile.pincode'), { maxLength: 12 })}
              {field('country', t('orgProfile.country'), { maxLength: 120 })}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
              {field('phone', t('orgProfile.phone'), { type: 'tel', maxLength: 20 })}
              {field('email', t('orgProfile.email'), { type: 'email', maxLength: 120 })}
              {field('website', t('orgProfile.website'), {
                type: 'url',
                maxLength: 200,
                placeholder: 'https://',
              })}
            </CardContent>
          </Card>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? t('orgProfile.saving') : t('orgProfile.save')}
            </Button>
            {saved && (
              <span role="status" className="text-sm text-muted-foreground">
                {t('orgProfile.saved')}
              </span>
            )}
          </div>
        </form>
      ) : hasProfileContent(profile) ? (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6 text-sm">
            {form.description && <p className="whitespace-pre-line">{form.description}</p>}
            <dl className="grid gap-3 sm:grid-cols-2">
              {address && <ProfileRow label={t('orgProfile.addressLabel')} value={address} />}
              {form.phone && <ProfileRow label={t('orgProfile.phone')} value={form.phone} />}
              {form.email && <ProfileRow label={t('orgProfile.email')} value={form.email} />}
              {form.website && <ProfileRow label={t('orgProfile.website')} value={form.website} />}
            </dl>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {t('orgProfile.emptyMember')}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ProfileRow({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}
