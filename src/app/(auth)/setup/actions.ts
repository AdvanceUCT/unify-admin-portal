"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import * as agentClient from "@/lib/agentClient";
import { AgentServiceError } from "@/lib/agentClient";
import { validateLogoFile } from "@/lib/images/logoValidation";
import { requireRole } from "@/lib/auth/session";
import { deleteVendorDocument, getDocumentSignedUrl, uploadUniversityLogo } from "@/lib/storage/supabase";
import {
  getUniversityProfile,
  saveUniversityProfileLogoPath,
  upsertUniversityProfile,
} from "@/lib/university/profile";

const profileSchema = z.object({
  abbreviation: z.string().min(1, "Abbreviation is required"),
  contactEmail: z.string().email("Invalid email address"),
  name: z.string().min(1, "University name is required"),
});

type PersistedSetupProfile = NonNullable<Awaited<ReturnType<typeof getUniversityProfile>>>;

export async function serializeSetupProfile(profile: PersistedSetupProfile) {
  return {
    abbreviation: profile.abbreviation,
    contactEmail: profile.contactEmail,
    id: profile.id,
    issuerDid: profile.issuerDid,
    logoUrl: profile.logoPath ? await getDocumentSignedUrl(profile.logoPath) : null,
    name: profile.name,
    setupCompletedAt: profile.setupCompletedAt?.toISOString() ?? null,
    setupStatus: profile.setupStatus,
  };
}

/**
 * Saves the university profile and, if a logo file was included in the same
 * submission, uploads it in the same step — the setup wizard offers logo
 * upload as part of this one form rather than as a separate step, so this
 * reuses the same validate -> upload -> record-path sequence
 * `uploadUniversityLogoAction` (settings page) uses, just inlined here since
 * that action requires a profile to already exist and at this point in setup
 * it doesn't yet.
 */
export async function saveProfileAction(formData: FormData) {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  const rawData = Object.fromEntries(formData.entries());
  const parsed = profileSchema.safeParse(rawData);

  if (!parsed.success) {
    throw new Error(`Invalid profile data: ${parsed.error.flatten().fieldErrors}`);
  }

  let profile = await upsertUniversityProfile(parsed.data);

  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const validation = await validateLogoFile(file);
    if (!validation.ok) {
      throw new Error(validation.error ?? "That logo file could not be uploaded.");
    }

    let uploadedPath: string | undefined;
    try {
      const { path } = await uploadUniversityLogo(file, profile.id);
      uploadedPath = path;
      await saveUniversityProfileLogoPath(profile.id, session.user.id, path);
      profile = { ...profile, logoPath: path };
    } catch (error) {
      if (uploadedPath) {
        try {
          await deleteVendorDocument(uploadedPath);
        } catch (cleanupError) {
          console.error(
            `[setup] Failed to delete orphaned logo upload ${uploadedPath}:`,
            cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          );
        }
      }
      console.error("[setup] Logo upload failed:", error instanceof Error ? error.message : String(error));
      throw new Error("The profile was saved, but the logo upload failed. You can try again from Settings.");
    }
  }

  revalidatePath("/setup");

  return serializeSetupProfile(profile);
}

export async function checkAgentStatusAction() {
  try {
    const { ledger } = await agentClient.getStatus();
    return {
      agent: { reachable: true },
      checkedAt: new Date().toISOString(),
      ledger: { reachable: ledger.reachable },
    };
  } catch (error) {
    const message =
      error instanceof AgentServiceError
        ? `Agent service error: ${error.message} (status ${error.status})`
        : "An unexpected error occurred while checking agent status.";

    return {
      agent: { reachable: false },
      checkedAt: new Date().toISOString(),
      error: message,
      ledger: { reachable: false },
    };
  }
}

async function markSetupComplete(profile: PersistedSetupProfile, did: string) {
  const saved = await prisma.universityProfile.update({
    data: {
      issuerDid: did,
      setupCompletedAt: profile.setupCompletedAt ?? new Date(),
      setupStatus: "COMPLETE",
    },
    where: { id: profile.id },
  });

  revalidatePath("/setup");
  revalidatePath("/", "layout");

  return serializeSetupProfile(saved);
}

/**
 * Gets the issuer DID from the agent, creating it if needed.
 * The action is idempotent and marks setup complete whenever a DID is known.
 */
export async function createOrGetDidAction() {
  const profile = await getUniversityProfile();
  if (!profile) {
    throw new Error("University profile not found.");
  }

  if (profile.issuerDid) {
    return {
      did: profile.issuerDid,
      profile: await markSetupComplete(profile, profile.issuerDid),
    };
  }

  try {
    const { did } = await agentClient.getIssuerDid();
    return { did, profile: await markSetupComplete(profile, did) };
  } catch (error) {
    if (error instanceof AgentServiceError && error.status === 404) {
      try {
        const { did } = await agentClient.createIssuerDid(profile.name);
        return { did, profile: await markSetupComplete(profile, did) };
      } catch (createError) {
        if (createError instanceof AgentServiceError && createError.status === 409) {
          const details = createError.details as { did?: string } | undefined;
          if (details?.did) {
            return {
              did: details.did,
              profile: await markSetupComplete(profile, details.did),
            };
          }
        }

        throw new Error(`Failed to create DID: ${createError}`);
      }
    }

    if (error instanceof AgentServiceError && error.status === 409) {
      const details = error.details as { did?: string } | undefined;
      if (details?.did) {
        return {
          did: details.did,
          profile: await markSetupComplete(profile, details.did),
        };
      }
    }

    throw error;
  }
}
