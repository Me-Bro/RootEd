import { useTranslation } from 'react-i18next';
import { CONTACT_EMAIL, CONTACT_PHONE } from '@/lib/contact.js';

/** Email always; the phone / WhatsApp line only once a number is set in lib/contact.js. */
export function ContactBlock() {
  const { t } = useTranslation();
  return (
    <ul className="flex flex-col gap-1 text-sm" aria-label={t('landing.contact.label')}>
      <li>
        {t('landing.contact.email')}:{' '}
        <a className="font-medium underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
      </li>
      {CONTACT_PHONE && (
        <li>
          {t('landing.contact.phone')}:{' '}
          <a className="font-medium underline" href={`tel:${CONTACT_PHONE}`}>
            {CONTACT_PHONE}
          </a>
        </li>
      )}
    </ul>
  );
}
