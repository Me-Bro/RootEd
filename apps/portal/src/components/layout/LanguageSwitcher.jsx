import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, setStoredLanguage } from '@/i18n/languagePreference.js';

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();

  function change(lang) {
    setStoredLanguage(lang);
    i18n.changeLanguage(lang);
    document.documentElement.lang = lang === 'hi' ? 'hi' : 'en';
  }

  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="sr-only sm:not-sr-only">{t('portal.language')}</span>
      <select
        value={i18n.language}
        onChange={(e) => change(e.target.value)}
        className="h-8 rounded-lg border border-input bg-card px-2 text-xs text-foreground"
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang} value={lang}>
            {t(`languages.${lang}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
