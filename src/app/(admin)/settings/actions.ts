"use server";

import { revalidatePath } from "next/cache";

import { AuditAction } from "@/generated/prisma/enums";
import { checkAgentHealth } from "@/lib/agentClient";
import { writeAuditLog } from "@/lib/audit/audit";
import { ADMIN_ROLES } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { getUniversityProfile, updateUniversityProfile } from "@/lib/university/profile";

export async function updateUniversityProfileAction(formData: FormData) {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);

  const name = String(formData.get("name") ?? "").trim();
  const abbreviation = String(formData.get("abbreviation") ?? "").trim();
  const contactEmail = String(formData.get("contactEmail") ?? "").trim();
  const websiteUrl = String(formData.get("websiteUrl") ?? "").trim();

  if (!name || !abbreviation || !contactEmail) {
    throw new Error("Name, abbreviation, and contact email are required.");
  }

  const profile = await getUniversityProfile();
  if (!profile) {
    throw new Error("No university profile exists yet. Complete setup first.");
  }

  const updated = await updateUniversityProfile(profile.id, {
    name,
    abbreviation,
    contactEmail,
    websiteUrl: websiteUrl || null,
  });

  await writeAuditLog({
    action: AuditAction.SETTINGS_UPDATED,
    actorId: session.user.id,
    targetType: "UniversityProfile",
    targetId: updated.id,
    meta: { section: "university_profile" },
  });

  revalidatePath("/settings");
}

export async function checkAgentHealthAction() {
  await requireRole(ADMIN_ROLES);

  return checkAgentHealth();
}
