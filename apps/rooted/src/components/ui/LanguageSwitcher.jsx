import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { setStoredLanguage } from '../../i18n/languagePreference.js';
import { cn } from '../../lib/utils.js';

const OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'hi_en', label: 'हिंदी + English' },
];

export function LanguageSwitcherTrigger() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    document.documentElement.lang = i18n.language === 'hi' ? 'hi' : 'en';
  }, [i18n.language]);

  function select(code) {
    i18n.changeLanguage(code);
    setStoredLanguage(code);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-2 rounded-md hover:bg-muted text-muted-foreground"
        aria-label="Language settings"
      >
        <Languages size={18} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-44 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg z-50">
          <ul className="p-1">
            {OPTIONS.map((opt) => (
              <li key={opt.code}>
                <button
                  onClick={() => select(opt.code)}
                  className={cn(
                    'w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                    i18n.language === opt.code
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted text-foreground'
                  )}
                >
                  {opt.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
