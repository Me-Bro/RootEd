/**
 * Student logins are no longer mailed when created; `User.claimEmailSentAt` records when a
 * claim link actually went out. Every account that existed before this was mailed at creation,
 * so mark the still-unclaimed ones as sent, otherwise an admin would see them all as "never
 * invited" and a bulk send would re-mail the whole roster. Idempotent.
 */

import { User } from '../models/User.js';

export async function up() {
  await User.updateMany({ status: 'pending_claim', claimEmailSentAt: { $exists: false } }, [
    { $set: { claimEmailSentAt: { $ifNull: ['$updatedAt', '$createdAt'] } } },
  ]);
}
