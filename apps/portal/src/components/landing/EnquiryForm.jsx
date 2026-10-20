import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ENQUIRY_PROGRAMMES } from '@rooted/shared/constants';
import { enquirySubmitSchema } from '@rooted/shared/schemas';
import api from '@/lib/api.js';
import { Button } from '@/components/ui/Button.jsx';
import { Input, Select, Textarea } from '@/components/ui/Input.jsx';

const BLANK = {
  contactName: '',
  collegeName: '',
  email: '',
  phone: '',
  programme: 'not_sure',
  message: '',
  website: '', // honeypot: people never see it, form-filling bots do
};

/** The "request a proposal" form. Posts to the public POST /enquiries. */
export function EnquiryForm() {
  const { t } = useTranslation();
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState('');
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setFailure('');

    // The same schema the API checks with, so the two always agree.
    const parsed = enquirySubmitSchema.safeParse({
      ...form,
      message: form.message || undefined,
      website: form.website || undefined,
    });
    if (!parsed.success) {
      const next = {};
      for (const issue of parsed.error.issues) next[issue.path[0]] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});

    setSaving(true);
    try {
      await api.post('/enquiries', parsed.data);
      setSent(true);
      setForm(BLANK);
    } catch (err) {
      setFailure(
        err.response?.status === 429 ? t('landing.form.tooMany') : t('landing.form.failed')
      );
    } finally {
      setSaving(false);
    }
  }

  if (sent) {
    return (
      <div role="status" className="rounded-xl border border-border bg-card p-6">
        <p className="text-base font-semibold">{t('landing.form.thanksTitle')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('landing.form.thanksBody')}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label={t('landing.requestProposal')}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5"
    >
      <p className="text-sm text-muted-foreground">{t('landing.form.lead')}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={t('landing.form.contactName')}
          value={form.contactName}
          onChange={set('contactName')}
          error={errors.contactName}
          autoComplete="name"
          required
        />
        <Input
          label={t('landing.form.collegeName')}
          value={form.collegeName}
          onChange={set('collegeName')}
          error={errors.collegeName}
          autoComplete="organization"
          required
        />
        <Input
          label={t('landing.form.email')}
          type="email"
          value={form.email}
          onChange={set('email')}
          error={errors.email}
          autoComplete="email"
          required
        />
        <Input
          label={t('landing.form.phone')}
          type="tel"
          value={form.phone}
          onChange={set('phone')}
          error={errors.phone}
          autoComplete="tel"
          required
        />
      </div>

      <Select
        label={t('landing.form.programme')}
        value={form.programme}
        onChange={set('programme')}
      >
        {ENQUIRY_PROGRAMMES.map((key) => (
          <option key={key} value={key}>
            {t(`enquiries.programme.${key}`)}
          </option>
        ))}
      </Select>

      <Textarea
        label={t('landing.form.message')}
        value={form.message}
        onChange={set('message')}
        maxLength={2000}
      />

      {/* Honeypot, kept out of sight, reach and the accessibility tree. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <input
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={set('website')}
        />
      </div>

      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={saving}>
          {saving ? t('landing.form.sending') : t('landing.form.submit')}
        </Button>
        <p className="text-xs text-muted-foreground">{t('landing.form.privacy')}</p>
      </div>
    </form>
  );
}
