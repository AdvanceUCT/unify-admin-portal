"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AuditAction } from "@/generated/prisma/enums";
import { checkAgentHealth } from "@/lib/agentClient";
import { writeAuditLog } from "@/lib/audit/audit";
import { ADMIN_ROLES } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { getUniversityProfile, updateUniversityProfile } from "@/lib/university/profile";

export type UniversityProfileSettingsState = {
  status: "idle" | "success" | "error";
  message?: string;
};

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
