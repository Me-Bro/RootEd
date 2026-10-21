import { fmtDate } from './format.js';

export const ITEM_TYPES = ['theory', 'practical', 'assignment'];
export const SCHEDULE_MODES = ['dated', 'daily', 'weekly', 'none'];

export const TYPE_VARIANT = { theory: 'info', practical: 'warning', assignment: 'success' };

/** "Day 3", "Week 2", a date, or '' for a roadmap without a timeline. */
export function scheduleLabel(item, mode, t, locale) {
  if (mode === 'dated') return item.dueDate ? fmtDate(item.dueDate, locale) : '';
  if (mode === 'daily') return item.dayNumber ? t('roadmap.day', { n: item.dayNumber }) : '';
  if (mode === 'weekly') return item.weekNumber ? t('roadmap.week', { n: item.weekNumber }) : '';
  return '';
}
