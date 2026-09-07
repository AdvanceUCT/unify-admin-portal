/**
 * @fileoverview Encrypts and decrypts university Paystack secret keys at rest.
 * @module lib/payments/crypto
 */

import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "@/lib/config/env";

function encryptionKey() {
  if (!env.PAYSTACK_ENCRYPTION_KEY) {
    throw new Error("PAYSTACK_ENCRYPTION_KEY is not configured.");
  }
  const key = Buffer.from(env.PAYSTACK_ENCRYPTION_KEY, "base64");
  if (key.length !== 32) {
    throw new Error("PAYSTACK_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return key;
}

export function encryptPaystackKey(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptPaystackKey(value: string) {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Stored Paystack key is malformed.");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
