import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { feedbackSubmitSchema } from '@rooted/shared/schemas';
import api from '../../lib/api.js';
import { useAuth } from '../../contexts/useAuth.js';
import { Button } from '../ui/Button.jsx';
import { Label } from '../ui/label.jsx';
import { SelectField, SelectItem } from '../ui/SelectField.jsx';

const CATEGORIES = ['contact', 'bug', 'feedback', 'other'];

/**
 * "Contact support" for a signed-in user, any role. Posts to the same public
 * `POST /feedback` the landing-page form uses; the API reads the bearer token
 * itself and records the user and tenant, so super admins see who wrote in.
 */
export default function SupportForm() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [category, setCategory] = useState('contact');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);

  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || '';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // Same schema the API validates with, so the messages agree.
    const parsed = feedbackSubmitSchema.safeParse({
      category,
      name,
      email: user?.email,
      message,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('help.support.failed'));
      return;
    }

    setSaving(true);
    try {
      await api.post('/feedback', parsed.data);
      setSent(true);
      setMessage('');
    } catch (err) {
      setError(
        err?.response?.status === 429 ? t('help.support.tooMany') : t('help.support.failed')
      );
    } finally {
      setSaving(false);
    }
  }

  if (sent) {
    return (
      <div role="status" className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">{t('help.support.success')}</p>
        <Button variant="outline" size="sm" onClick={() => setSent(false)}>
          {t('help.support.sendAnother')}
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label={t('help.support.heading')}
      className="flex max-w-lg flex-col gap-3"
    >
      <p className="text-sm text-muted-foreground">
        {t('help.support.replyTo', { email: user?.email })}
      </p>

      <SelectField
        id="support-category"
        label={t('help.support.categoryLabel')}
        value={category}
        onValueChange={setCategory}
      >
        {CATEGORIES.map((c) => (
          <SelectItem key={c} value={c}>
            {t(`help.support.categories.${c}`)}
          </SelectItem>
        ))}
      </SelectField>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="support-message">{t('help.support.messageLabel')}</Label>
        <textarea
          id="support-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={4000}
          rows={5}
          required
          className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" disabled={saving} size="sm" className="w-fit">
        {saving ? t('help.support.sending') : t('help.support.submit')}
      </Button>
    </form>
  );
}
