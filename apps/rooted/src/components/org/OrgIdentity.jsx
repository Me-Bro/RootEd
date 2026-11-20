import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react';
import { formatOrgCode } from '@rooted/shared/utils';
import { Button } from '../ui/Button.jsx';

/** The org's logo, or its initials when it has none (or the image fails to load). */
export function OrgLogo({ name, logoUrl, className = 'h-16 w-16' }) {
  const [failed, setFailed] = useState(false);
  const initials = (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  if (logoUrl && !failed) {
    return (
      <img
        src={logoUrl}
        alt=""
        onError={() => setFailed(true)}
        className={`${className} shrink-0 rounded-lg border border-border bg-white object-contain`}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={`${className} flex shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg font-semibold text-primary`}
    >
      {initials || '?'}
    </div>
  );
}

/** `ABCD-2345` with a copy button. Safe to show anyone in the org: it grants nothing. */
export function OrgCode({ code }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  if (!code) return null;
  const display = formatOrgCode(code);

  async function copy() {
    try {
      await navigator.clipboard.writeText(display);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (insecure origin, embedded webview); the code
      // is still on screen to read out, so say nothing rather than fail loudly.
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-sm tracking-wider" data-testid="org-code">
        {display}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={copy}
        aria-label={t('org.copyCode')}
        className="h-7 px-1.5"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? t('org.copied') : ''}
      </span>
    </span>
  );
}
