import { User } from '../models/User.js';
import { UsernameHistory } from '../models/UsernameHistory.js';
import { AppError } from '../middleware/errorHandler.js';
import { generateToken, hashToken } from './auth.service.js';

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000;
export const USERNAME_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
export const USERNAME_HISTORY_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Splits a login identifier into a User filter. An identifier containing '@' is
 * an email; anything else is a username. Usernames cannot contain '@' (see
 * USERNAME_PATTERN), so this is unambiguous and needs only one lookup.
 */
export function loginFilterFor(identifier) {
  const value = identifier.trim().toLowerCase();
  return value.includes('@') ? { email: value } : { usernameLower: value };
}

/**
 * True when nobody holds this username and nobody recently released it.
 * Parked handles stay unavailable for USERNAME_HISTORY_TTL_MS so a renamed
 * user can't be impersonated by whoever grabs their old handle.
 */
export async function isUsernameAvailable(usernameLower, { forUserId } = {}) {
  const [owner, parked] = await Promise.all([
    User.findOne({ usernameLower }, '_id').lean(),
    UsernameHistory.findOne({ usernameLower }, 'userId').lean(),
  ]);

  if (owner) return String(owner._id) === String(forUserId ?? '');
  // Reclaiming your own recently-released handle is fine — you are the person
  // it would otherwise be protecting.
  if (parked) return String(parked.userId) === String(forUserId ?? '');
  return true;
}

/**
 * Applies a username change to an in-memory user document, parking the previous
 * handle. Does not save — the caller owns the write.
 */
export async function applyUsernameChange(user, nextUsername) {
  const usernameLower = nextUsername.toLowerCase();
  if (user.usernameLower === usernameLower) return false;

  const changedAt = user.usernameChangedAt?.getTime() ?? 0;
  const elapsed = Date.now() - changedAt;
  if (changedAt && elapsed < USERNAME_CHANGE_COOLDOWN_MS) {
    const days = Math.ceil((USERNAME_CHANGE_COOLDOWN_MS - elapsed) / (24 * 60 * 60 * 1000));
    throw new AppError(`You can change your username again in ${days} day(s)`, 429);
  }

  if (!(await isUsernameAvailable(usernameLower, { forUserId: user._id }))) {
    throw new AppError('That username is taken', 409);
  }

  if (user.usernameLower) {
    await UsernameHistory.findOneAndUpdate(
      { usernameLower: user.usernameLower },
      {
        $set: {
          userId: user._id,
          releasedAt: new Date(),
          expiresAt: new Date(Date.now() + USERNAME_HISTORY_TTL_MS),
        },
      },
      { upsert: true }
    );
  }

  user.username = nextUsername;
  user.usernameLower = usernameLower;
  user.usernameChangedAt = new Date();
  return true;
}

/** Issues an email-verification token, returning the raw value to mail out. */
export async function issueEmailVerification(userId) {
  const token = generateToken();
  await User.updateOne(
    { _id: userId },
    {
      emailVerificationToken: hashToken(token),
      emailVerificationExpires: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
    },
    { _bypassTenantScope: true }
  );
  return token;
}

/** Issues an email-change token against a pending address. */
export async function issueEmailChange(userId, newEmail) {
  const token = generateToken();
  await User.updateOne(
    { _id: userId },
    {
      pendingEmail: newEmail,
      pendingEmailToken: hashToken(token),
      pendingEmailExpires: new Date(Date.now() + EMAIL_CHANGE_TTL_MS),
    },
    { _bypassTenantScope: true }
  );
  return token;
}

/**
 * Derives a username from an email local part, adding a numeric suffix until it
 * is free. Used by the backfill migration and by seeds, never by registration —
 * a registering user always picks their own.
 */
export async function deriveUsernameFromEmail(email, { forUserId } = {}) {
  const base =
    email
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '')
      .replace(/^[._-]+|[._-]+$/g, '')
      .slice(0, 24) || 'user';

  let candidate = base.length >= 3 ? base : `${base}user`.slice(0, 24);
  for (let n = 2; !(await isUsernameAvailable(candidate, { forUserId })); n += 1) {
    candidate = `${base.slice(0, 24 - String(n).length - 1)}-${n}`;
  }
  return candidate;
}
