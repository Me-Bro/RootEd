import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MessageCircle } from 'lucide-react';
import { waLink } from '@rooted/shared/utils';
import api from '../../lib/api.js';
import { formatCurrency } from '../../utils/intl.js';

/**
 * A "Remind" link that opens WhatsApp with a fee reminder already typed; the sender
 * presses send. Renders nothing without a valid mobile number or an amount owed.
 */
export default function WhatsappReminder({ number, name, amount, overdue = 0 }) {
  const { t } = useTranslation();
  // Shared with the dashboard; the centre name only signs the message, so a failure is fine.
  const { data: tenant } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => api.get('/tenant/settings').then((r) => r.data),
    retry: false,
  });
  if (!(amount > 0)) return null;
  const text = t(overdue > 0 ? 'studyCenter.whatsapp.feeOverdue' : 'studyCenter.whatsapp.feeDue', {
    name,
    amount: formatCurrency(amount),
    overdue: formatCurrency(overdue),
    centre: tenant?.name ?? '',
  }).trim();
  const url = waLink(number, text);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="whatsapp-remind"
      className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
    >
      <MessageCircle size={13} aria-hidden="true" />
      {t('studyCenter.whatsapp.remind')}
    </a>
  );
}
