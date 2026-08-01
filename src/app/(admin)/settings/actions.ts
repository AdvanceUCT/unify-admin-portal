"use server";

import { revalidatePath } from "next/cache";

import { AuditAction } from "@/generated/prisma/enums";
import { getStatus } from "@/lib/agentClient";
import { writeAuditLog } from "@/lib/audit/audit";
import { ADMIN_ROLES } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { env } from "@/lib/config/env";
import { sendCredentialActivationEmail } from "@/lib/email/credential-activation";
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

export async function testAgentConnectionAction() {
  await requireRole(ADMIN_ROLES);

  const checkedAt = new Date().toISOString();

  try {
    const result = await getStatus();
    return {
      checkedAt,
      ok: true as const,
      reachable: result.ledger.reachable,
      status: result.status,
    };
  } catch (error) {
    return {
      checkedAt,
      error: error instanceof Error ? error.message : "Connection failed.",
      ok: false as const,
    };
  }
}

export async function sendTestEmailAction() {
  const session = await requireRole(ADMIN_ROLES);

  const to = session.user.email;
  if (!to) {
    throw new Error("Your account has no email address on file.");
  }

  const result = await sendCredentialActivationEmail({
    activationUrl: `${env.ACTIVATION_PUBLIC_BASE_URL ?? env.APP_URL}/activate/settings-test`,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    studentName: "Test Student",
    to,
  });

  return { provider: result.provider, to };
}
