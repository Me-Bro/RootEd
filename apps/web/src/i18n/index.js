import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import hi from './locales/hi.json';
import { buildHiEnResource } from './mergeHiEn.js';
import { getStoredLanguage } from './languagePreference.js';

const hiEn = buildHiEnResource(en, hi);

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
    hi_en: { translation: hiEn },
  },
  lng: getStoredLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

document.documentElement.lang = i18n.language === 'hi' ? 'hi' : 'en';

export default i18n;
