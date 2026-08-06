import "server-only";

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

import { env } from "@/lib/config/env";

function encryptionKey() {
  if (!env.VENDOR_WEBHOOK_ENCRYPTION_KEY) {
    throw new Error("VENDOR_WEBHOOK_ENCRYPTION_KEY is not configured.");
  }
  const key = Buffer.from(env.VENDOR_WEBHOOK_ENCRYPTION_KEY, "base64");
  if (key.length !== 32) {
    throw new Error("VENDOR_WEBHOOK_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return key;
}

export function hashVendorApiKey(value: string) {
  if (!env.VENDOR_API_KEY_PEPPER || env.VENDOR_API_KEY_PEPPER.length < 32) {
    throw new Error("VENDOR_API_KEY_PEPPER must be configured with at least 32 characters.");
  }
  return createHmac("sha256", env.VENDOR_API_KEY_PEPPER).update(value).digest("hex");
}

export function encryptVendorSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptVendorSecret(value: string) {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Stored vendor secret is malformed.");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
