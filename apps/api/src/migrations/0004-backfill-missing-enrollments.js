/**
 * Students created after 0001 ran (POST /students and CSV import did not
 * create an Enrollment) were missing from batch rosters. Same idempotent
 * backfill as 0001, run again now that the routes keep Enrollment in sync.
 */
export { up } from './0001-backfill-enrollments.js';
