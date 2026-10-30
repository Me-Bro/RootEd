export const SUPPORTED_LANGUAGES = ['en', 'hi', 'hi_en'];

const STORAGE_KEY = 'app-lang';

export function isValidLanguage(lang) {
  return SUPPORTED_LANGUAGES.includes(lang);
}

export function getStoredLanguage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isValidLanguage(raw) ? raw : 'en';
  } catch {
    return 'en';
  }
}

export function setStoredLanguage(lang) {
  if (!isValidLanguage(lang)) return;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}
