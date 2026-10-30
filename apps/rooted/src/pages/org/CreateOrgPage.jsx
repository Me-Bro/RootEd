import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ORG_TYPES } from '@rooted/shared/constants';
import api, { setAccessToken } from '../../lib/api.js';
import { useAuth } from '../../contexts/useAuth.js';
import AuthShell from '../../components/auth/AuthShell.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';

export default function CreateOrgPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [name, setName] = useState('');
  const [orgType, setOrgType] = useState('school');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const { data } = await api.post('/orgs', { name: name.trim(), orgType });
      // POST /orgs returns a session already scoped to the new organization,
      // so adopt it rather than making the user pick what they just created.
      setAccessToken(data.accessToken);
      await refreshUser();
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || t('org.createFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthShell title={t('org.createOrganization')} description={t('org.createOrgDescription')}>
      <form
        onSubmit={handleSubmit}
        aria-label={t('org.createOrganization')}
        className="flex flex-col gap-4"
      >
        <Input
          label={t('org.organizationName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
          maxLength={120}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="org-type" className="text-sm font-medium">
            {t('org.organizationType')}
          </label>
          <select
            id="org-type"
            value={orgType}
            onChange={(e) => setOrgType(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
          >
            {ORG_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`org.orgType.${type}`)}
              </option>
            ))}
          </select>
          {/* orgType decides which modules exist and what a student is called,
              and it can only be changed while the organization has no students
              (PATCH /tenant/settings enforces that), so say so before they
              choose rather than after. */}
          <p className="text-xs text-muted-foreground">{t('org.orgTypeHint')}</p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" disabled={saving} size="lg" className="mt-1 w-full">
          {saving ? t('org.creating') : t('org.createOrganization')}
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={() => navigate(-1)}>
          {t('common.cancel')}
        </Button>
      </form>
    </AuthShell>
  );
}
