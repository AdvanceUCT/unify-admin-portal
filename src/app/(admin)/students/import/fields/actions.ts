/**
 * @fileoverview Contains the server actions used by the `/students/import/fields` workflow.
 * @module app/(admin)/students/import/fields/actions
 */

"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import { addCustomFieldDefinition, removeCustomFieldDefinition } from "@/lib/imports/customFields";
import { isRequiredByActiveSchema } from "@/lib/imports/mapping";
import { getActiveCredentialSchema } from "@/lib/university/credentialSchema";
import { getUniversityProfile } from "@/lib/university/profile";

export type AddCustomFieldState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function addCustomFieldAction(
  _previousState: AddCustomFieldState,
  formData: FormData,
): Promise<AddCustomFieldState> {
  await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER"]);

  const profile = await getUniversityProfile();
  if (!profile) {
    return { message: "University profile has not been configured.", status: "error" };
  }

  try {
    await addCustomFieldDefinition({
      key: String(formData.get("key") ?? ""),
      label: String(formData.get("label") ?? ""),
      universityProfileId: profile.id,
    });

    revalidatePath("/students/import/fields");
    return { status: "success" };
  } catch (error) {
    return { message: error instanceof Error ? error.message : "Failed to add custom field.", status: "error" };
  }
}

/**
 * Removing a custom field required by the active credential schema needs
 * explicit confirmation (`confirmed=true`) — without it, this is a no-op
 * rather than a silent removal. The client-side confirm dialog
 * (`RemoveCustomFieldButton`) is the primary gate; this check is defense in
 * depth in case the request reaches here without going through it.
 */
export async function removeCustomFieldAction(formData: FormData) {
  await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER"]);

  const profile = await getUniversityProfile();
  if (!profile) {
    return;
  }

  const key = String(formData.get("key") ?? "");
  if (!key) {
    return;
  }

  const confirmed = formData.get("confirmed") === "true";
  const schema = await getActiveCredentialSchema(profile.id);
  const dependsOnSchema = schema ? isRequiredByActiveSchema(key, schema.schemaAttributes) : false;

  if (dependsOnSchema && !confirmed) {
    return;
  }

  await removeCustomFieldDefinition({ key, universityProfileId: profile.id });
  revalidatePath("/students/import/fields");
}
