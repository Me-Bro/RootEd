import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api.js';
import { pushToast } from '@/lib/toast.js';
import { Button } from '@/components/ui/Button.jsx';
import { Input } from '@/components/ui/Input.jsx';

/**
 * Corrects the login address of someone whose first one bounced, and mails the
 * claim link to the new one. `membershipId` is the TenantMembership id (the same
 * one the suspend action uses); the server refuses anything but a never-signed-in
 * account, so this only needs to be offered when the address is flagged.
 */
export function FixEmail({ membershipId, name, onDone }) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  const [email, setEmail] = useState('');

  const fix = useMutation({
    mutationFn: () => api.patch(`/tenant/members/${membershipId}/email`, { email }),
    meta: { silent: true },
    onSuccess: () => {
      pushToast(t('people.emailFixed'));
      setAsking(false);
      setEmail('');
      onDone();
    },
    onError: (err) => pushToast(err.response?.data?.error || t('common.error'), 'error'),
  });

  if (!asking) {
    return (
      <Button
        size="sm"
        variant="outline"
        aria-label={t('people.fixEmailFor', { name })}
        onClick={() => setAsking(true)}
      >
        {t('people.fixEmail')}
      </Button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        fix.mutate();
      }}
    >
      <Input
        type="email"
        required
        label={t('people.newEmailFor', { name })}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button type="submit" size="sm" disabled={fix.isPending}>
        {t('people.students.send')}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
        {t('common.cancel')}
      </Button>
    </form>
  );
}
