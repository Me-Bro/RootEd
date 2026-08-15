import crypto from 'crypto';
import { env } from '../config/env.js';

export function getTenantKey(tenantId) {
  return crypto.hkdfSync(
    'sha256',
    Buffer.from(env.MASTER_ENCRYPTION_KEY, 'utf8'),
    Buffer.from(tenantId.toString(), 'utf8'),
    Buffer.from('rooted-field-encryption', 'utf8'),
    32
  );
}

export function encrypt(plaintext, tenantKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', tenantKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('hex'),
    ciphertext: encrypted.toString('hex'),
    tag: tag.toString('hex'),
  });
}

export function decrypt(encryptedJson, tenantKey) {
  const { iv, ciphertext, tag } = JSON.parse(encryptedJson);
  const decipher = crypto.createDecipheriv('aes-256-gcm', tenantKey, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function encryptField(value, tenantId) {
  if (!value) return value;
  const key = getTenantKey(tenantId);
  return encrypt(String(value), key);
}

export function decryptField(encryptedJson, tenantId) {
  if (!encryptedJson) return encryptedJson;
  const key = getTenantKey(tenantId);
  return decrypt(encryptedJson, key);
}
