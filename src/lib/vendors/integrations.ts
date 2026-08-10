/**
 * @fileoverview Creates and rotates vendor API keys and webhook configuration.
 * @module lib/vendors/integrations
 */

import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { VendorApplicationStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import { decryptVendorSecret, encryptVendorSecret, hashVendorApiKey } from "@/lib/vendors/integrationCrypto";
import { assertSafeWebhookUrl } from "@/lib/vendors/webhookSafety";
import { requestIdFrom } from "@/lib/requestId";
import { normalizedVerificationAttributes, summarizeVerificationStudent } from "@/lib/vendors/verificationContract";

export async function approvedVendorProfileForUser(userId: string) {
  return prisma.vendorProfile.findFirst({
    where: {
      userId,
      applications: { some: { status: VendorApplicationStatus.APPROVED } },
    },
  });
}

export async function createVendorApiCredential(vendorProfileId: string, name: string) {
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error("API key name is required.");

  const prefix = randomBytes(6).toString("hex");
  const token = `unify_vk_${prefix}_${randomBytes(32).toString("base64url")}`;
  const record = await prisma.vendorApiCredential.create({
    data: {
      vendorProfileId,
      name: normalizedName,
      keyPrefix: prefix,
      keyHash: hashVendorApiKey(token),
    },
  });
  return { id: record.id, name: record.name, prefix, token, createdAt: record.createdAt };
}

export function listVendorApiCredentials(vendorProfileId: string) {
  return prisma.vendorApiCredential.findMany({
    where: { vendorProfileId },
    select: { id: true, name: true, keyPrefix: true, createdAt: true, lastUsedAt: true, revokedAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeVendorApiCredential(vendorProfileId: string, credentialId: string) {
  const result = await prisma.vendorApiCredential.updateMany({
    where: { id: credentialId, vendorProfileId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count !== 1) throw new Error("Active API key was not found.");
}

export async function authenticateVendorApiKey(header: string | null) {
  const token = header?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const prefix = token?.match(/^unify_vk_([a-f0-9]{12})_[A-Za-z0-9_-]+$/)?.[1];
  if (!token || !prefix) return null;

  const credential = await prisma.vendorApiCredential.findUnique({
    where: { keyPrefix: prefix },
    include: {
      vendorProfile: {
        include: { applications: { where: { status: VendorApplicationStatus.APPROVED }, select: { id: true } } },
      },
    },
  });
  if (!credential || credential.revokedAt || credential.vendorProfile.applications.length === 0) return null;

  const actual = Buffer.from(hashVendorApiKey(token));
  const expected = Buffer.from(credential.keyHash);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  await prisma.vendorApiCredential.update({ where: { id: credential.id }, data: { lastUsedAt: new Date() } });
  return credential.vendorProfile;
}

export async function configureVendorWebhook(vendorProfileId: string, rawUrl: string) {
  const url = await assertSafeWebhookUrl(rawUrl);
  const signingSecret = randomBytes(32).toString("base64url");
  await prisma.vendorWebhookConfig.upsert({
    where: { vendorProfileId },
    create: {
      vendorProfileId,
      url,
      signingSecretCiphertext: encryptVendorSecret(signingSecret),
      enabled: true,
    },
    update: {
      url,
      signingSecretCiphertext: encryptVendorSecret(signingSecret),
      enabled: true,
    },
  });
  return { url, signingSecret };
}

export function getVendorWebhookConfig(vendorProfileId: string) {
  return prisma.vendorWebhookConfig.findUnique({
    where: { vendorProfileId },
    select: { url: true, enabled: true, createdAt: true, updatedAt: true },
  });
}

export async function disableVendorWebhook(vendorProfileId: string) {
  await prisma.vendorWebhookConfig.updateMany({ where: { vendorProfileId }, data: { enabled: false } });
}

export async function deliverVendorWebhook(vendorVerificationId: string, requestId?: string) {
  const verification = await prisma.vendorVerification.findUnique({
    where: { id: vendorVerificationId },
    include: { vendorProfile: { include: { webhookConfig: true } }, deliveries: true },
  });
  const config = verification?.vendorProfile.webhookConfig;
  if (!verification || !config?.enabled || !verification.verificationRequestId) return { skipped: true } as const;

  const url = await assertSafeWebhookUrl(config.url);
  const attributes = normalizedVerificationAttributes(verification.attributes);
  const payload = {
    eventId: verification.eventId ?? `verification:${verification.verificationRequestId}`,
    verificationRequestId: verification.verificationRequestId,
    checkoutId: verification.checkoutId ?? undefined,
    status: verification.status,
    isVerified: verification.isVerified ?? null,
    failureCode: verification.failureCode ?? undefined,
    attributes,
    student: summarizeVerificationStudent(attributes),
    expiresAt: verification.expiresAt?.toISOString(),
    completedAt: verification.completedAt?.toISOString(),
  };
  const body = JSON.stringify(payload);
  const signature = `sha256=${createHmac("sha256", decryptVendorSecret(config.signingSecretCiphertext)).update(body).digest("hex")}`;
  const correlationId = requestIdFrom(requestId);
  const attemptNumber = verification.deliveries.length + 1;
  let status: "DELIVERED" | "FAILED" = "FAILED";
  let responseStatus: number | undefined;
  let errorMessage: string | undefined;

  try {
    const response = await fetch(url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(3_000),
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": correlationId,
        "X-Unify-Event-Id": payload.eventId,
        "X-Unify-Signature": signature,
      },
      body,
    });
    responseStatus = response.status;
    status = response.ok ? "DELIVERED" : "FAILED";
    if (!response.ok) errorMessage = `Webhook returned HTTP ${response.status}.`;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message.slice(0, 240) : "Webhook request failed.";
  }

  await prisma.vendorWebhookDelivery.create({
    data: { vendorVerificationId, attemptNumber, status, responseStatus, errorMessage },
  });
  return { skipped: false, status, responseStatus } as const;
}
