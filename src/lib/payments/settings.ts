/**
 * @fileoverview Manages university payment-services enablement, contacts, and Paystack keys.
 * @module lib/payments/settings
 */

import "server-only";

import { z } from "zod";

import { AuditAction } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/audit";
import { prisma } from "@/lib/db/prisma";
import { decryptPaystackKey, encryptPaystackKey } from "@/lib/payments/crypto";
import {
  classifyPaystackSecretKey,
  validatePaystackSecretKey,
  type PaystackKeyMode,
} from "@/lib/payments/paystackClient";

export async function getUniversityPaymentSettings(universityProfileId: string) {
  return prisma.universityPaymentSettings.findUnique({
    where: { universityProfileId },
  });
}

const contactsSchema = z.object({
  financeContactName: z.string().trim().max(200).optional(),
  financeContactEmail: z.string().trim().email().optional().or(z.literal("")),
  technicalContactName: z.string().trim().max(200).optional(),
  technicalContactEmail: z.string().trim().email().optional().or(z.literal("")),
  payoutCadence: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
});

export async function upsertPaymentContacts(
  universityProfileId: string,
  actorId: string,
  input: z.infer<typeof contactsSchema>,
) {
  const data = contactsSchema.parse(input);

  await prisma.$transaction(async (transaction) => {
    await transaction.universityPaymentSettings.upsert({
      where: { universityProfileId },
      create: {
        universityProfileId,
        financeContactName: data.financeContactName || null,
        financeContactEmail: data.financeContactEmail || null,
        technicalContactName: data.technicalContactName || null,
        technicalContactEmail: data.technicalContactEmail || null,
        payoutCadence: data.payoutCadence,
      },
      update: {
        financeContactName: data.financeContactName || null,
        financeContactEmail: data.financeContactEmail || null,
        technicalContactName: data.technicalContactName || null,
        technicalContactEmail: data.technicalContactEmail || null,
        payoutCadence: data.payoutCadence,
      },
    });

    await writeAuditLog(
      {
        action: AuditAction.PAYMENT_SETTINGS_UPDATED,
        actorId,
        targetType: "UniversityPaymentSettings",
        targetId: universityProfileId,
        meta: { section: "payment_contacts" },
      },
      transaction,
    );
  });
}

/**
 * Validates a Paystack secret key against the live API before persisting it.
 * Throws without writing anything if the key is malformed or Paystack rejects it.
 */
export async function savePaystackKey(
  universityProfileId: string,
  actorId: string,
  key: string,
): Promise<{ mode: PaystackKeyMode }> {
  const trimmedKey = key.trim();
  const mode = classifyPaystackSecretKey(trimmedKey);
  await validatePaystackSecretKey(trimmedKey);

  const ciphertext = encryptPaystackKey(trimmedKey);
  const now = new Date();
  const fieldsByMode = {
    TEST: { paystackTestKeyCiphertext: ciphertext, paystackTestKeyValidatedAt: now },
    LIVE: { paystackLiveKeyCiphertext: ciphertext, paystackLiveKeyValidatedAt: now },
  } as const;

  await prisma.$transaction(async (transaction) => {
    await transaction.universityPaymentSettings.upsert({
      where: { universityProfileId },
      create: { universityProfileId, ...fieldsByMode[mode] },
      update: fieldsByMode[mode],
    });

    await writeAuditLog(
      {
        action: AuditAction.PAYSTACK_KEY_UPDATED,
        actorId,
        targetType: "UniversityPaymentSettings",
        targetId: universityProfileId,
        meta: { mode },
      },
      transaction,
    );
  });

  return { mode };
}

/** Decrypts the active Paystack secret key for a given mode, for server-side use only (e.g. future charge/payout calls). */
export async function getDecryptedPaystackKey(
  universityProfileId: string,
  mode: PaystackKeyMode,
): Promise<string | null> {
  const settings = await getUniversityPaymentSettings(universityProfileId);
  const ciphertext =
    mode === "TEST" ? settings?.paystackTestKeyCiphertext : settings?.paystackLiveKeyCiphertext;
  return ciphertext ? decryptPaystackKey(ciphertext) : null;
}

export async function enablePaymentServices(universityProfileId: string, actorId: string) {
  await prisma.$transaction(async (transaction) => {
    await transaction.universityProfile.update({
      where: { id: universityProfileId },
      data: { paymentServicesEnabled: true, paymentServicesEnabledAt: new Date() },
    });

    await writeAuditLog(
      {
        action: AuditAction.PAYMENT_SERVICES_ENABLED,
        actorId,
        targetType: "UniversityProfile",
        targetId: universityProfileId,
      },
      transaction,
    );
  });
}
