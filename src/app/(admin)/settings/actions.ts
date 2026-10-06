/**
 * @fileoverview Contains the server actions used by the `/settings` workflow.
 * @module app/(admin)/settings/actions
 */

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AuditAction } from "@/generated/prisma/enums";
import { checkAgentHealth } from "@/lib/agentClient";
import { writeAuditLog } from "@/lib/audit/audit";
import { ADMIN_ROLES, assertCan } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { parseAnnualDate } from "@/lib/credentials/academicPeriod";
import {
  previewPolicyChange,
  saveValidityPolicy,
} from "@/lib/credentials/validityPolicy";
import { validateLogoFile } from "@/lib/images/logoValidation";
import { OVERDRAFT_SUSPENSION_DAYS_MAX } from "@/lib/payments/constants";
import {
  deleteVendorDocument,
  uploadUniversityLogo,
} from "@/lib/storage/supabase";
import {
  getUniversityProfile,
  removeUniversityProfileLogo,
  saveUniversityProfileLogoPath,
  updateUniversityProfile,
} from "@/lib/university/profile";

export type UniversityProfileSettingsState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export type LogoActionResult = { ok: boolean; error?: string };

const profileSettingsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "University name must be at least 2 characters.")
    .max(160),
  abbreviation: z
    .string()
    .trim()
    .min(2, "Abbreviation must be at least 2 characters.")
    .max(24),
  contactEmail: z.string().trim().email("Enter a valid contact email address."),
  websiteUrl: z
    .string()
    .trim()
    .refine(
      (value) => !value || /^https?:\/\//i.test(value),
      "Website URL must begin with http:// or https://.",
    )
    .refine((value) => {
      if (!value) return true;
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    }, "Enter a valid website URL."),
});

export async function updateUniversityProfileAction(
  _previousState: UniversityProfileSettingsState,
  formData: FormData,
): Promise<UniversityProfileSettingsState> {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  const parsed = profileSettingsSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    abbreviation: String(formData.get("abbreviation") ?? ""),
    contactEmail: String(formData.get("contactEmail") ?? ""),
    websiteUrl: String(formData.get("websiteUrl") ?? ""),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message:
        parsed.error.issues[0]?.message ??
        "Please check the form and try again.",
    };
  }

  try {
    const profile = await getUniversityProfile();
    if (!profile) {
      return {
        status: "error",
        message: "No university profile exists yet. Complete setup first.",
      };
    }

    const updated = await updateUniversityProfile(profile.id, {
      name: parsed.data.name,
      abbreviation: parsed.data.abbreviation,
      contactEmail: parsed.data.contactEmail,
      websiteUrl: parsed.data.websiteUrl || null,
    });

    await writeAuditLog({
      action: AuditAction.SETTINGS_UPDATED,
      actorId: session.user.id,
      targetType: "UniversityProfile",
      targetId: updated.id,
      meta: { section: "university_profile" },
    });

    revalidatePath("/settings");
    return { status: "success", message: "University profile updated." };
  } catch {
    return {
      status: "error",
      message: "Unable to update the university profile. Please try again.",
    };
  }
}

export async function checkAgentHealthAction() {
  await requireRole(ADMIN_ROLES);

  return checkAgentHealth();
}

function revalidateUniversityLogoPaths() {
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

export async function uploadUniversityLogoAction(
  formData: FormData,
): Promise<LogoActionResult> {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return {
      ok: false,
      error: "No file was provided. Please choose an image to upload.",
    };
  }
  const validation = await validateLogoFile(file);
  if (!validation.ok) return validation;

  const profile = await getUniversityProfile();
  if (!profile) {
    return {
      ok: false,
      error: "No university profile exists yet. Complete setup first.",
    };
  }

  let uploadedPath: string | undefined;
  try {
    const { path } = await uploadUniversityLogo(file, profile.id);
    uploadedPath = path;
    const { previousPath } = await saveUniversityProfileLogoPath(
      profile.id,
      session.user.id,
      path,
    );

    if (previousPath && previousPath !== path) {
      try {
        await deleteVendorDocument(previousPath);
      } catch (error) {
        console.error(
          `[university-logo] Failed to delete replaced logo ${previousPath}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    revalidateUniversityLogoPaths();
    return { ok: true };
  } catch {
    if (uploadedPath) {
      try {
        await deleteVendorDocument(uploadedPath);
      } catch (error) {
        console.error(
          `[university-logo] Failed to delete orphaned upload ${uploadedPath}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    return {
      ok: false,
      error: "Something went wrong while uploading. Please try again.",
    };
  }
}

export async function removeUniversityLogoAction(): Promise<LogoActionResult> {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  const profile = await getUniversityProfile();
  if (!profile) {
    return {
      ok: false,
      error: "No university profile exists yet. Complete setup first.",
    };
  }

  try {
    const { removedPath } = await removeUniversityProfileLogo(
      profile.id,
      session.user.id,
    );
    if (removedPath) {
      try {
        await deleteVendorDocument(removedPath);
      } catch (error) {
        console.error(
          `[university-logo] Failed to delete removed logo ${removedPath}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    revalidateUniversityLogoPaths();
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Unable to remove the university logo. Please try again.",
    };
  }
}

function annualPolicyFrom(startDate: string, expiryDate: string) {
  const start = parseAnnualDate(startDate, "DD-MM"),
    expiry = parseAnnualDate(expiryDate, "DD-MM");
  return {
    startMonth: start.month,
    startDay: start.day,
    expiryMonth: expiry.month,
    expiryDay: expiry.day,
  };
}
export async function saveRenewalSettingsAction(formData: FormData) {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  await saveValidityPolicy(
    annualPolicyFrom(
      String(formData.get("startDate")),
      String(formData.get("expiryDate")),
    ),
    session.user.id,
  );
  revalidatePath("/settings");
  revalidatePath("/credentials/renewals");
  revalidatePath("/credentials/issuance/renewals");
}
export async function getRenewalSettingsPreviewAction(
  startDate: string,
  expiryDate: string,
) {
  await requireRole(["SUPER_ADMIN", "ADMIN"]);
  return previewPolicyChange(annualPolicyFrom(startDate, expiryDate));
}

/** `invoice:read` — refreshes the billing operations card's numbers without a full page reload. */
export async function getBillingOperationsSummaryAction() {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  assertCan("invoice:read", session);

  const { getBillingOperationsSummary } =
    await import("@/lib/billing/operationsSummary");
  return getBillingOperationsSummary();
}

/**
 * `invoice:reconcile` — the same bounded sweep the daily cron and the CLI
 * run, triggerable on demand. Acquires the same job lease, so this can
 * never race an in-progress cron/CLI reconciliation into double-processing.
 */
export async function runBillingReconciliationNowAction() {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  assertCan("invoice:reconcile", session);

  const { BILLING_JOB_TYPE_RECONCILE } =
    await import("@/lib/billing/constants");
  const { acquireJobLease, completeJobLease, failJobLease } =
    await import("@/lib/billing/jobLease");
  const { runVendorBillingReconciliation } =
    await import("@/lib/billing/reconciliation");
  const { getBillingOperationsSummary } =
    await import("@/lib/billing/operationsSummary");

  const lease = await acquireJobLease(prisma, {
    jobType: BILLING_JOB_TYPE_RECONCILE,
    leaseOwner: `admin:${session.user.id}`,
  });
  if (!lease) {
    throw new Error(
      "A reconciliation run is already in progress (cron or another admin). Try again shortly.",
    );
  }

  try {
    const reconciliation = await runVendorBillingReconciliation(prisma);
    await completeJobLease(prisma, lease.runId, {
      scannedCount:
        reconciliation.attemptsSwept + reconciliation.gatewayEventsRetried,
      importedCount:
        reconciliation.attemptsConfirmed +
        reconciliation.gatewayEventsRecovered,
      exceptionCount: reconciliation.gatewayEventsStillFailing,
      totalsSnapshot: reconciliation,
    });

    await writeAuditLog({
      action: "INVOICE_PAYMENT_RECONCILED",
      actorId: session.user.id,
      meta: {
        attemptsSwept: reconciliation.attemptsSwept,
        attemptsConfirmed: reconciliation.attemptsConfirmed,
        gatewayEventsRetried: reconciliation.gatewayEventsRetried,
        gatewayEventsRecovered: reconciliation.gatewayEventsRecovered,
      },
    });
  } catch (error) {
    await failJobLease(prisma, lease.runId, error);
    throw error;
  }

  revalidatePath("/settings");
  return getBillingOperationsSummary();
}

export type PaymentWalletSettingsResult = { status: "saved" } | { status: "error"; message: string };

const RAND_AMOUNT_PATTERN = /^\d+(?:\.\d{1,2})?$/;

function parseThresholdMinor(value: string) {
  const trimmed = value.trim();
  if (!RAND_AMOUNT_PATTERN.test(trimmed)) return null;
  const amountMinor = Math.round(Number(trimmed) * 100);
  return Number.isSafeInteger(amountMinor) && amountMinor > 0 ? amountMinor : null;
}

function parseSuspensionDays(value: string) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const days = Number(trimmed);
  return days >= 1 && days <= OVERDRAFT_SUSPENSION_DAYS_MAX ? days : null;
}

/**
 * SUPER_ADMIN only (spec §3.6). Updates the platform-wide payout threshold and
 * overdraft suspension days; both take effect at the next nightly run.
 */
export async function updatePaymentWalletSettingsAction(formData: FormData): Promise<PaymentWalletSettingsResult> {
  const session = await requireRole(["SUPER_ADMIN"]);

  const thresholdMinor = parseThresholdMinor(String(formData.get("payoutThreshold") ?? ""));
  if (thresholdMinor === null) {
    return { status: "error", message: "Payout threshold must be an amount in rand greater than zero, e.g. 500.00." };
  }
  const suspensionDays = parseSuspensionDays(String(formData.get("overdraftSuspensionDays") ?? ""));
  if (suspensionDays === null) {
    return {
      status: "error",
      message: `Overdraft suspension must be a whole number of days between 1 and ${OVERDRAFT_SUSPENSION_DAYS_MAX}.`,
    };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const universities = await tx.universityProfile.findMany({
      take: 2,
      select: { id: true, paymentWalletPayoutThresholdMinor: true, paymentWalletOverdraftSuspensionDays: true },
    });
    if (universities.length !== 1) return false;
    const [current] = universities;

    await tx.universityProfile.update({
      where: { id: current.id },
      data: {
        paymentWalletPayoutThresholdMinor: BigInt(thresholdMinor),
        paymentWalletOverdraftSuspensionDays: suspensionDays,
      },
    });
    await writeAuditLog({
      action: AuditAction.PAYMENT_WALLET_SETTINGS_UPDATED,
      actorId: session.user.id,
      targetType: "UniversityProfile",
      targetId: current.id,
      meta: {
        oldPayoutThresholdMinor: Number(current.paymentWalletPayoutThresholdMinor),
        newPayoutThresholdMinor: thresholdMinor,
        oldOverdraftSuspensionDays: current.paymentWalletOverdraftSuspensionDays,
        newOverdraftSuspensionDays: suspensionDays,
      },
    }, tx);
    return true;
  });
  if (!updated) {
    return { status: "error", message: "Exactly one university profile is required. Complete the setup wizard first." };
  }

  revalidatePath("/settings");
  return { status: "saved" };
}
