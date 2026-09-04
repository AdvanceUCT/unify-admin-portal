/**
 * @fileoverview Contains the server actions used by the `/settings` workflow.
 * @module app/(admin)/settings/actions
 */

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AuditAction, CredentialAutomationJobStatus, CredentialAutomationJobType } from "@/generated/prisma/enums";
import { checkAgentHealth } from "@/lib/agentClient";
import { writeAuditLog } from "@/lib/audit/audit";
import { ADMIN_ROLES } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { countCredentialsDueForRenewal } from "@/lib/credentials/renewalPolicy";
import { validateLogoFile } from "@/lib/images/logoValidation";
import { deleteVendorDocument, uploadUniversityLogo } from "@/lib/storage/supabase";
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
  name: z.string().trim().min(2, "University name must be at least 2 characters.").max(160),
  abbreviation: z.string().trim().min(2, "Abbreviation must be at least 2 characters.").max(24),
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
      message: parsed.error.issues[0]?.message ?? "Please check the form and try again.",
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
    return { ok: false, error: "No file was provided. Please choose an image to upload." };
  }
  const validation = await validateLogoFile(file);
  if (!validation.ok) return validation;

  const profile = await getUniversityProfile();
  if (!profile) {
    return { ok: false, error: "No university profile exists yet. Complete setup first." };
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
    return { ok: false, error: "Something went wrong while uploading. Please try again." };
  }
}

export async function removeUniversityLogoAction(): Promise<LogoActionResult> {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  const profile = await getUniversityProfile();
  if (!profile) {
    return { ok: false, error: "No university profile exists yet. Complete setup first." };
  }

  try {
    const { removedPath } = await removeUniversityProfileLogo(profile.id, session.user.id);
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
    return { ok: false, error: "Unable to remove the university logo. Please try again." };
  }
}

const renewalSettingsSchema = z.object({
  automaticCredentialRenewalEnabled: z.boolean(),
  defaultCredentialValidityDays: z.coerce.number().int().min(1).max(3650),
  renewalCadenceMonths: z.coerce.number().int().min(1).max(120),
});

export async function saveRenewalSettingsAction(formData: FormData) {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  const parsed = renewalSettingsSchema.safeParse({
    automaticCredentialRenewalEnabled: formData.get("automaticCredentialRenewalEnabled") === "on",
    defaultCredentialValidityDays: formData.get("defaultCredentialValidityDays"),
    renewalCadenceMonths: formData.get("renewalCadenceMonths"),
  });

  if (!parsed.success) {
    throw new Error("Validity days and renewal cadence must be valid positive numbers.");
  }

  const profile = await getUniversityProfile();
  if (!profile) {
    throw new Error("University profile was not found.");
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.universityProfile.update({
      data: parsed.data,
      where: { id: profile.id },
    });

    if (!parsed.data.automaticCredentialRenewalEnabled) {
      await transaction.credentialAutomationJob.updateMany({
        data: { completedAt: new Date(), status: CredentialAutomationJobStatus.CANCELLED },
        where: { status: CredentialAutomationJobStatus.PENDING, type: CredentialAutomationJobType.AUTO_RENEW },
      });
    }

    await transaction.auditLog.create({
      data: {
        action: AuditAction.RENEWAL_SETTINGS_UPDATED,
        actorId: session.user.id,
        meta: parsed.data,
        targetId: profile.id,
        targetType: "UniversityProfile",
      },
    });
  });

  revalidatePath("/settings");
}

export async function getRenewalSettingsPreviewAction(cadenceMonths: number) {
  await requireRole(["SUPER_ADMIN", "ADMIN"]);
  if (!Number.isInteger(cadenceMonths) || cadenceMonths < 1 || cadenceMonths > 120) return 0;
  return countCredentialsDueForRenewal(cadenceMonths);
}
