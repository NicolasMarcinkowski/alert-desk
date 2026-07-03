/**
 * Chiffrement applicatif des secrets stockés en DB (token Flex IBKR,
 * config des canaux de notification).
 *
 * Format : "v1:" + base64(iv ‖ ciphertext ‖ authTag) — AES-256-GCM.
 * La clé vient de APP_ENCRYPTION_KEY (32 octets encodés en base64).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const VERSION_PREFIX = "v1:";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("APP_ENCRYPTION_KEY environment variable is not set");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "APP_ENCRYPTION_KEY must be 32 bytes base64-encoded (openssl rand -base64 32)"
    );
  }
  return key;
}

export function seal(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return VERSION_PREFIX + Buffer.concat([iv, ciphertext, authTag]).toString("base64");
}

export function open(sealed: string): string {
  if (!sealed.startsWith(VERSION_PREFIX)) {
    throw new Error("Unknown sealed payload version");
  }
  const key = getKey();
  const payload = Buffer.from(sealed.slice(VERSION_PREFIX.length), "base64");
  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(payload.length - AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH, payload.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8"
  );
}
