import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { feedbackSubmitSchema } from '@rooted/shared/schemas';
import api from '../../lib/api.js';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';

const BLANK = { name: '', email: '', message: '' };

export default function ContactForm() {
  const { t } = useTranslation();
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // Same schema the API validates with, so the messages agree.
    const parsed = feedbackSubmitSchema.safeParse({ ...form, category: 'contact' });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('landing.footer.contactForm.failed'));
      return;
    }

    setSaving(true);
    try {
      await api.post('/feedback', parsed.data);
      setSent(true);
      setForm(BLANK);
    } catch {
      setError(t('landing.footer.contactForm.failed'));
    } finally {
      setSaving(false);
    }
  }

  if (sent) {
    return (
      <p className="text-sm text-muted-foreground">{t('landing.footer.contactForm.success')}</p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label={t('landing.footer.contactForm.heading')}
      className="flex flex-col gap-3 max-w-sm"
    >
      <Input
        id="contact-form-name"
        label={t('landing.footer.contactForm.nameLabel')}
        value={form.name}
        onChange={set('name')}
        required
      />
      <Input
        id="contact-form-email"
        label={t('landing.footer.contactForm.emailLabel')}
        type="email"
        value={form.email}
        onChange={set('email')}
        required
        autoComplete="email"
      />
      <Input
        id="contact-form-message"
        label={t('landing.footer.contactForm.messageLabel')}
        value={form.message}
        onChange={set('message')}
        required
      />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" disabled={saving} size="sm">
        {saving ? t('landing.footer.contactForm.sending') : t('landing.footer.contactForm.submit')}
      </Button>
    </form>
  );
}
