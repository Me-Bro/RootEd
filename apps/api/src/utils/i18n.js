const messages = {
  en: {
    'auth.invalid': 'Invalid email or password',
    'auth.locked': 'Account locked. Try again later.',
    'tenant.not_found': 'Tenant not found',
  },
};

/**
 * Translate a message key to a locale string.
 * @param {string} key
 * @param {string} [locale='en']
 * @returns {string}
 */
export function t(key, locale = 'en') {
  return messages[locale]?.[key] ?? key;
}
