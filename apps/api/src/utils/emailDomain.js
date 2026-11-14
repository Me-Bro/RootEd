import { Resolver } from 'dns/promises';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';

// The domain has no such record. Anything else (timeout, SERVFAIL, refused) says
// nothing about the domain, so those fail open: a DNS blip must not block a signup.
const NO_ANSWER = new Set(['ENOTFOUND', 'ENODATA']);

const TTL_MS = 60 * 60 * 1000;
// ponytail: per-process cache, cleared when full. Share it through Redis if several API replicas run.
const MAX_CACHE = 1000;
const cache = new Map();

const defaultResolver = new Resolver({ timeout: 2000, tries: 1 });

// true = can receive mail, false = cannot, null = could not tell.
async function domainHasMail(domain, r) {
  try {
    const mx = await r.resolveMx(domain);
    // RFC 7505 null MX ("0 .") says outright that the domain takes no mail.
    if (mx.length) return mx.some((m) => m.exchange && m.exchange !== '.');
  } catch (err) {
    if (!NO_ANSWER.has(err.code)) return null;
  }
  // No MX record: RFC 5321 falls back to the domain's own address.
  for (const type of ['resolve4', 'resolve6']) {
    try {
      if ((await r[type](domain)).length) return true;
    } catch (err) {
      if (!NO_ANSWER.has(err.code)) return null;
    }
  }
  return false;
}

/**
 * Returns why an address's domain cannot receive mail, or null when it can (or
 * when the check is off or inconclusive). Checks the domain only; it cannot tell
 * whether the mailbox exists. API-side because `dns` is Node-only and the shared
 * Zod schemas also run in the browser.
 */
export async function emailDomainProblem(
  email,
  { resolver = defaultResolver, enabled = env.EMAIL_MX_CHECK } = {}
) {
  if (!enabled) return null;
  const domain = String(email).split('@').pop().trim().toLowerCase();
  if (!domain) return null;

  const hit = cache.get(domain);
  let ok;
  if (hit && Date.now() - hit.at < TTL_MS) {
    ok = hit.ok;
  } else {
    ok = await domainHasMail(domain, resolver);
    if (ok === null) return null; // inconclusive: allow, and look again next time
    if (cache.size >= MAX_CACHE) cache.clear();
    cache.set(domain, { ok, at: Date.now() });
  }
  return ok ? null : `${domain} cannot receive email`;
}

/** Throws a 422 when the address's domain cannot receive mail. */
export async function assertDeliverableDomain(email, opts) {
  const problem = await emailDomainProblem(email, opts);
  if (problem) throw new AppError(`That email address is not valid: ${problem}`, 422);
}

export function clearEmailDomainCache() {
  cache.clear();
}
