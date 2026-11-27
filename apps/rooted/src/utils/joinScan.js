import { JOIN_CODE_LENGTH, JOIN_CODE_PREFIX } from '@rooted/shared/constants';
import { normalizeJoinCode } from '@rooted/shared/utils';

/**
 * The join code inside whatever a QR code held: our join link (`…/orgs/join?code=…`) or a
 * bare code. Returns it formatted the way the field shows it, or null when the text is
 * anything else, so scanning a stray QR code is ignored rather than filled in.
 */
export function codeFromScan(text) {
  const raw = String(text ?? '').trim();
  if (!raw || raw.length > 200) return null;

  let candidate = raw;
  try {
    const url = new URL(raw);
    candidate = url.searchParams.get('code') ?? '';
  } catch {
    // not a URL: treat the text as the code itself
  }

  const body = normalizeJoinCode(candidate);
  if (body.length !== JOIN_CODE_LENGTH) return null;
  const half = body.length / 2;
  return `${JOIN_CODE_PREFIX}-${body.slice(0, half)}-${body.slice(half)}`;
}

/** Whether this browser can open a camera at all (it needs HTTPS or localhost). */
export const canScanQr = () =>
  typeof window !== 'undefined' &&
  window.isSecureContext &&
  Boolean(navigator.mediaDevices?.getUserMedia);

/**
 * The check-in token inside a centre's QR code (`…/me/scan?t=<token>`), or null for any
 * other QR code, so a stray one is ignored.
 */
export function checkInTokenFromScan(text) {
  try {
    const url = new URL(String(text ?? '').trim());
    const token = url.searchParams.get('t');
    return url.pathname === '/me/scan' && token && token.length <= 128 ? token : null;
  } catch {
    return null;
  }
}
