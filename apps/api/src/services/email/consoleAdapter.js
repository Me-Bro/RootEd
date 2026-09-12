import { logger } from '../../utils/logger.js';

/** Matches href="..." in the templates' single call-to-action button. */
const HREF = /href="([^"]+)"/;

/**
 * Logs the message instead of delivering it. For self-hosted/demo deployments
 * with no mail provider wired up: the verification, reset and invite flows all
 * hinge on a single link, so that link is pulled out and logged on its own
 * rather than making you dig it out of the HTML in `docker logs`.
 */
export async function sendViaConsole({ to, subject, html }) {
  logger.info({ to, subject, link: html.match(HREF)?.[1] }, 'Email (console provider — not sent)');
}
