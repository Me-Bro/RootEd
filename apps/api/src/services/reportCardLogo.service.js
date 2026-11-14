import { getObjectBuffer } from './storage.service.js';
import { logger } from '../utils/logger.js';

// A missing or unreadable logo must never fail a batch or a preview: the cards
// just go out without it.
export async function loadReportCardLogo(key) {
  if (!key) return null;
  try {
    return await getObjectBuffer(key);
  } catch (err) {
    logger.warn({ err, key }, 'Report card logo could not be loaded, rendering without it');
    return null;
  }
}
