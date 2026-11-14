import { User } from '../models/User.js';

/**
 * Flags the account that owns `email` as unreachable. Advisory only: nothing is
 * blocked, an admin sees the flag and can fix the address. A no-op for an
 * address with no account (an invite to a stranger has nothing to flag; the
 * EmailLog row remains the record).
 */
export async function markBounced(email, reason) {
  const address = String(email ?? '')
    .trim()
    .toLowerCase();
  if (!address) return 0;
  const res = await User.updateOne(
    { email: address },
    { $set: { emailBouncedAt: new Date(), emailBounceReason: String(reason).slice(0, 100) } }
  );
  return res.modifiedCount;
}
