import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from '@rooted/shared/constants';
import { registerSchema } from '@rooted/shared/schemas';
import api from '../../lib/api.js';
import AuthShell from '../../components/auth/AuthShell.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';

const BLANK = {
  firstName: '',
  lastName: '',
  email: '',
  username: '',
  password: '',
  confirm: '',
};

export default function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [available, setAvailable] = useState(null);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const username = form.username.trim().toLowerCase();
  const tooShort = username.length < USERNAME_MIN_LENGTH;

  // Advisory only — registration re-checks server-side and the unique index is
  // what actually decides. Debounced so typing does not fire a request per
  // keystroke at a rate-limited endpoint. The answer carries the username it
  // was for, so a slow reply cannot be shown against a newer input.
  useEffect(() => {
    if (tooShort) return undefined;
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get('/auth/username-available', { params: { username } });
        setAvailable({ ...data, username });
      } catch {
        setAvailable({ username, available: null });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [username, tooShort]);

  const checked = !tooShort && available?.username === username ? available : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirm) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }

    // Same schema the API validates with, so the messages agree.
    const parsed = registerSchema.safeParse({
      email: form.email,
      username: form.username,
      password: form.password,
      firstName: form.firstName,
      lastName: form.lastName,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('auth.registerFailed'));
      return;
    }

    setSaving(true);
    try {
      await api.post('/auth/register', parsed.data);
      // Deliberately the same destination whether or not the address was
      // already registered — the API answers identically, and the UI must not
      // give away what it withholds.
      navigate(`/check-email?email=${encodeURIComponent(parsed.data.email)}`);
    } catch (err) {
      setError(err.response?.data?.error || t('auth.registerFailed'));
    } finally {
      setSaving(false);
    }
  }

  const usernameHint =
    checked == null || checked.available == null
      ? undefined
      : checked.available
        ? t('auth.usernameAvailable')
        : (checked.reason ?? t('auth.usernameTaken'));

  return (
    <AuthShell title={t('auth.createAccount')} description={t('auth.createAccountDescription')}>
      <form
        onSubmit={handleSubmit}
        aria-label={t('auth.createAccount')}
        className="flex flex-col gap-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={t('auth.firstName')}
            value={form.firstName}
            onChange={set('firstName')}
            required
            autoComplete="given-name"
          />
          <Input
            label={t('auth.lastName')}
            value={form.lastName}
            onChange={set('lastName')}
            required
            autoComplete="family-name"
          />
        </div>

        <Input
          label={t('auth.email')}
          type="email"
          value={form.email}
          onChange={set('email')}
          required
          autoComplete="email"
        />

        <div className="flex flex-col gap-1">
          <Input
            label={t('auth.username')}
            value={form.username}
            onChange={set('username')}
            required
            minLength={USERNAME_MIN_LENGTH}
            maxLength={USERNAME_MAX_LENGTH}
            autoComplete="username"
            error={checked && checked.available === false ? usernameHint : undefined}
          />
          {checked?.available === true && (
            <p className="text-xs text-muted-foreground">{usernameHint}</p>
          )}
        </div>

        <Input
          label={t('auth.password')}
          type="password"
          value={form.password}
          onChange={set('password')}
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
        />
        <Input
          label={t('auth.confirmPassword')}
          type="password"
          value={form.confirm}
          onChange={set('confirm')}
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
        />

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" disabled={saving} size="lg" className="mt-1 w-full">
          {saving ? t('auth.creatingAccount') : t('auth.createAccount')}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          {t('auth.alreadyHaveAccount')}{' '}
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="text-primary hover:underline"
          >
            {t('auth.signIn')}
          </button>
        </p>
      </form>
    </AuthShell>
  );
}
