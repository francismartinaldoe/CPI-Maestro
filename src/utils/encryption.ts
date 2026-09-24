// src/utils/encryption.ts — AES-256-GCM encrypt/decrypt for secrets
//
// The Web UI encrypts all secrets before sending them over HTTP.
// The server decrypts them using MAESTRO_ENCRYPTION_KEY from .env.
// This prevents plaintext secrets in HTTP bodies or browser localStorage.
//
// Key: 32-byte hex string set in MAESTRO_ENCRYPTION_KEY.
// Auto-generates and logs a key if not set (dev mode only).

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const hex = process.env.MAESTRO_ENCRYPTION_KEY;
  if (hex && hex.length === 64) return Buffer.from(hex, 'hex');

  // Dev mode: auto-generate a key and log it once
  const generated = randomBytes(32);
  const generatedHex = generated.toString('hex');
  process.env.MAESTRO_ENCRYPTION_KEY = generatedHex;
  console.warn(
    `[encryption] MAESTRO_ENCRYPTION_KEY not set — generated for this session:\n` +
    `  MAESTRO_ENCRYPTION_KEY=${generatedHex}\n` +
    `  Add this to your .env to persist credentials across restarts.`
  );
  return generated;
}

/** Encrypt plaintext → base64 string (iv:authTag:ciphertext). */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv  = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv(24) + authTag(32) + ciphertext — all base64
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

/** Decrypt base64 string → plaintext. Returns null if decryption fails. */
export function decrypt(encoded: string): string | null {
  try {
    const parts = encoded.split(':');
    if (parts.length !== 3) return null;
    const [ivB64, tagB64, encB64] = parts;
    const key     = getKey();
    const iv      = Buffer.from(ivB64,  'base64');
    const tag     = Buffer.from(tagB64, 'base64');
    const encData = Buffer.from(encB64, 'base64');
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encData).toString('utf8') + decipher.final('utf8');
  } catch {
    return null;
  }
}
