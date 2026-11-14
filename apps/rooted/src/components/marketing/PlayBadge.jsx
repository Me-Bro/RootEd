import { PLAY_STORE_URL } from './landingContent.js';

// The four-colour Play triangle.
function PlayMark() {
  return (
    <svg viewBox="0 0 24 26" aria-hidden="true" focusable="false">
      <path d="M1 1.2v23.6c0 .5.5.8 1 .5L13 13z" fill="#00d7fe" />
      <path d="M17 9.3 13 13l4 3.7 5-2.8c1-.6 1-1.9 0-2.5z" fill="#ffce00" />
      <path d="M2 .7 13 13l4-3.7z" fill="#00f076" />
      <path d="M2 25.3 13 13l4 3.7z" fill="#f43249" />
    </svg>
  );
}

/**
 * "Get it on Google Play" link. Renders nothing for brands without a
 * `playStoreUrl`, so every call site can drop it in unconditionally.
 *
 * TODO(design): swap for Google's official badge artwork
 * (https://play.google.com/intl/en_us/badges/) before launch — Google's brand
 * rules want their own asset, not a lookalike. The aria-label is the
 * accessible name either way.
 */
export default function PlayBadge({ t, className = '' }) {
  if (!PLAY_STORE_URL) return null;
  return (
    <a
      className={`play ${className}`.trim()}
      href={PLAY_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('landing.android.badgeAria')}
    >
      <PlayMark />
      <span>
        <small>{t('landing.android.badgeSmall')}</small>
        <b>Google Play</b>
      </span>
    </a>
  );
}
