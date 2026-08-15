import { authenticator } from 'otplib';
import qrcode from 'qrcode';
import crypto from 'crypto';
import { User } from '../models/User.js';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';

function encryptSecret(plaintext) {
  const key = Buffer.from(env.MASTER_ENCRYPTION_KEY.slice(0, 32), 'utf8');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptSecret(ciphertext) {
  const [ivHex, tagHex, encHex] = ciphertext.split(':');
  const key = Buffer.from(env.MASTER_ENCRYPTION_KEY.slice(0, 32), 'utf8');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const enc = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc) + decipher.final('utf8');
}

export async function generateMfaSecret(user) {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(user.email, 'RootEd', secret);
  const qrDataUrl = await qrcode.toDataURL(otpauthUrl);
  return { secret, otpauthUrl, qrDataUrl };
}

export function verifyMfaToken(secret, token) {
  return authenticator.verify({ token, secret });
}

export async function enableMfa(userId, secret) {
  const encrypted = encryptSecret(secret);
  await User.updateOne(
    { _id: userId },
    { mfaSecret: encrypted, mfaEnabled: true },
    { _bypassTenantScope: true }
  );
}

export function getMfaSecret(encryptedSecret) {
  return decryptSecret(encryptedSecret);
}
