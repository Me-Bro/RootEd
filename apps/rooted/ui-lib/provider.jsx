import i18n from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import en from '../src/i18n/locales/en.json';
import { brand } from '../src/lib/brand.js';

// Its own instance, so the library carries no app state (no stored language, no document side effects).
const instance = i18n.createInstance();
instance.init({
  resources: { en: { translation: en } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false, defaultVariables: brand },
});

/**
 * Wrap anything built with these components in this once, at the root. Components read the
 * translations (i18n) and link with react-router, and both throw or show raw keys without it.
 */
export function RootEdProvider({ children }) {
  return (
    <I18nextProvider i18n={instance}>
      <MemoryRouter>{children}</MemoryRouter>
    </I18nextProvider>
  );
}
