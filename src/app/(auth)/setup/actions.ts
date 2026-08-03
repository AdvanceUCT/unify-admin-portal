"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import * as agentClient from "@/lib/agentClient";
import { AgentServiceError } from "@/lib/agentClient";
import { getUniversityProfile, upsertUniversityProfile } from "@/lib/university/profile";

const profileSchema = z.object({
  abbreviation: z.string().min(1, "Abbreviation is required"),
  contactEmail: z.string().email("Invalid email address"),
  logoUrl: z.string().url().optional().or(z.literal("")),
  name: z.string().min(1, "University name is required"),
});

type PersistedSetupProfile = NonNullable<Awaited<ReturnType<typeof getUniversityProfile>>>;

function serializeSetupProfile(profile: PersistedSetupProfile) {
  return {
    abbreviation: profile.abbreviation,
    contactEmail: profile.contactEmail,
    id: profile.id,
    issuerDid: profile.issuerDid,
    logoUrl: profile.logoUrl,
    name: profile.name,
    setupCompletedAt: profile.setupCompletedAt?.toISOString() ?? null,
    setupStatus: profile.setupStatus,
  };
}

export async function saveProfileAction(formData: FormData) {
  const rawData = Object.fromEntries(formData.entries());
  const parsed = profileSchema.safeParse(rawData);

  if (!parsed.success) {
    throw new Error(`Invalid profile data: ${parsed.error.flatten().fieldErrors}`);
  }

  const profile = await upsertUniversityProfile({
    ...parsed.data,
    logoUrl: parsed.data.logoUrl || null,
  });
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
