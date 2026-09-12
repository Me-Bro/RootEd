import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PASSWORD_MIN_LENGTH } from '@rooted/shared/constants';
import { DELETE_ACCOUNT_CONFIRMATION } from '@rooted/shared/schemas';
import api from '../../lib/api.js';
import { useAuth } from '../../contexts/useAuth.js';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';

/** A card that owns its own submit state, so one failure cannot blank another. */
function SettingsCard({
  title,
  children,
  onSubmit,
  submitLabel,
  busyLabel,
  submitVariant = 'default',
  submitDisabled = false,
  className,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setDone('');
    setBusy(true);
    try {
      const message = await onSubmit();
      if (message) setDone(message);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} aria-label={title} className="flex flex-col gap-4">
          {children}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {done && (
            <p role="status" className="text-sm text-muted-foreground">
              {done}
            </p>
          )}
          <div>
            <Button type="submit" variant={submitVariant} disabled={busy || submitDisabled}>
              {busy ? busyLabel : submitLabel}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function AccountSettingsPage() {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();

  const [profile, setProfile] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    phone: user?.phone ?? '',
  });
  const [username, setUsername] = useState(user?.username ?? '');
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [deletion, setDeletion] = useState({ password: '', confirmation: '' });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('account.title')} description={t('account.description')} />

      <SettingsCard
        title={t('account.profile')}
        submitLabel={t('common.save')}
        busyLabel={t('auth.saving')}
        onSubmit={async () => {
          // Only send what was actually filled in. updateProfileSchema requires
          // min(1) on any field it receives and rejects an empty patch, so
          // submitting blanks for the fields a user has never set fails the
          // whole save.
          const patch = Object.fromEntries(
            Object.entries(profile).filter(([, v]) => v.trim() !== '')
          );
          if (Object.keys(patch).length === 0) throw new Error(t('account.nothingToSave'));
          await api.patch('/auth/me', patch);
          await refreshUser();
          return t('account.profileSaved');
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t('auth.firstName')}
            value={profile.firstName}
            onChange={(e) => setProfile((p) => ({ ...p, firstName: e.target.value }))}
          />
          <Input
            label={t('auth.lastName')}
            value={profile.lastName}
            onChange={(e) => setProfile((p) => ({ ...p, lastName: e.target.value }))}
          />
        </div>
        <Input
          label={t('account.phone')}
          value={profile.phone}
          onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
        />
      </SettingsCard>

      <SettingsCard
        title={t('account.username')}
        submitLabel={t('account.changeUsername')}
        busyLabel={t('auth.saving')}
        onSubmit={async () => {
          await api.patch('/auth/me', { username });
          await refreshUser();
          return t('account.usernameSaved');
        }}
      >
        <Input
          label={t('auth.username')}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
        />
        {/* A released handle is parked for 90 days and changes are limited to
            one per 30 days, so somebody cannot free a recognisable name for
            someone else to claim. Say so before they try, not after a 429. */}
        <p className="text-xs text-muted-foreground">{t('account.usernameHint')}</p>
      </SettingsCard>

      <SettingsCard
        title={t('account.email')}
        submitLabel={t('account.changeEmail')}
        busyLabel={t('auth.sending')}
        onSubmit={async () => {
          await api.post('/auth/change-email', { newEmail, currentPassword: emailPassword });
          setNewEmail('');
          setEmailPassword('');
          await refreshUser();
          return t('account.emailChangeRequested');
        }}
      >
        <p className="text-sm text-muted-foreground">
          {t('account.currentEmail', { email: user?.email ?? '' })}
        </p>
        {user?.pendingEmail && (
          <p role="status" className="text-sm text-muted-foreground">
            {t('account.pendingEmail', { email: user.pendingEmail })}
          </p>
        )}
        <Input
          label={t('account.newEmail')}
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <Input
          label={t('account.currentPassword')}
          type="password"
          value={emailPassword}
          onChange={(e) => setEmailPassword(e.target.value)}
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="current-password"
        />
        {/* Nothing changes until the link sent to the new address is used, and
            the old address is told either way. */}
        <p className="text-xs text-muted-foreground">{t('account.emailChangeHint')}</p>
      </SettingsCard>

      <SettingsCard
        title={t('account.password')}
        submitLabel={t('account.changePassword')}
        busyLabel={t('auth.saving')}
        onSubmit={async () => {
          if (passwords.next !== passwords.confirm) {
            throw new Error(t('auth.passwordsDoNotMatch'));
          }
          await api.post('/auth/change-password', {
            currentPassword: passwords.current,
            newPassword: passwords.next,
          });
          // Every session is revoked, including this one, so there is nothing
          // to refresh — the next request will bounce to /login.
          window.location.href = '/login';
          return null;
        }}
      >
        <Input
          label={t('account.currentPassword')}
          type="password"
          value={passwords.current}
          onChange={(e) => setPasswords((p) => ({ ...p, current: e.target.value }))}
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="current-password"
        />
        <Input
          label={t('auth.newPassword')}
          type="password"
          value={passwords.next}
          onChange={(e) => setPasswords((p) => ({ ...p, next: e.target.value }))}
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
        />
        <Input
          label={t('auth.confirmPassword')}
          type="password"
          value={passwords.confirm}
          onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))}
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">{t('account.passwordChangeHint')}</p>
      </SettingsCard>

      {/* Danger zone. Google Play requires an in-app path to delete the account
          for any app that offers account creation, which /register does. The
          server refuses if this person is the last admin of an active org. */}
      <SettingsCard
        title={t('account.deleteTitle')}
        className="ring-destructive/40"
        submitLabel={t('account.deleteButton')}
        busyLabel={t('account.deleting')}
        submitVariant="destructive"
        submitDisabled={deletion.confirmation.trim() !== DELETE_ACCOUNT_CONFIRMATION}
        onSubmit={async () => {
          await api.post('/auth/delete-account', {
            currentPassword: deletion.password,
            confirmation: deletion.confirmation.trim(),
          });
          // Every session is gone, including this one.
          window.location.href = '/login';
          return null;
        }}
      >
        <p className="text-sm text-destructive">{t('account.deleteWarning')}</p>
        <p className="text-sm text-muted-foreground">{t('account.deleteKept')}</p>
        <Input
          label={t('account.currentPassword')}
          type="password"
          value={deletion.password}
          onChange={(e) => setDeletion((d) => ({ ...d, password: e.target.value }))}
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="current-password"
        />
        <Input
          label={t('account.deleteConfirmLabel', { word: DELETE_ACCOUNT_CONFIRMATION })}
          value={deletion.confirmation}
          onChange={(e) => setDeletion((d) => ({ ...d, confirmation: e.target.value }))}
          required
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          <Link to="/legal/account-deletion" className="underline">
            {t('account.deleteLearnMore')}
          </Link>
        </p>
      </SettingsCard>
    </div>
  );
}
