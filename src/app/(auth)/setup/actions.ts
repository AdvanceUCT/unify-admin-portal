"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import {
  getUniversityProfile,
  upsertUniversityProfile,
} from "@/lib/university/profile";
import { createCredentialSchema } from "@/lib/university/credentialSchema";
import * as agentClient from "@/lib/agentClient";
import { AgentServiceError } from "@/lib/agentClient";

const profileSchema = z.object({
  name: z.string().min(1, "University name is required"),
  abbreviation: z.string().min(1, "Abbreviation is required"),
  logoUrl: z.string().url().optional().or(z.literal("")),
  contactEmail: z.string().email("Invalid email address"),
});

export async function saveProfileAction(formData: FormData) {
  const rawData = Object.fromEntries(formData.entries());
  const parsed = profileSchema.safeParse(rawData);

  if (!parsed.success) {
    // In a real app, you'd return detailed field errors.
    // For this PoC, a simple error is sufficient.
    throw new Error(
      `Invalid profile data: ${parsed.error.flatten().fieldErrors}`,
    );
  }

  await upsertUniversityProfile({
    ...parsed.data,
    logoUrl: parsed.data.logoUrl || null,
  });
  revalidatePath("/setup");
}

export async function checkAgentStatusAction() {
  try {
    const { ledger } = await agentClient.getStatus();
    return { reachable: ledger.reachable };
  } catch (error) {
    if (error instanceof AgentServiceError) {
      return {
        reachable: false,
        error: `Agent service error: ${error.message} (status ${error.status})`,
      };
    }
    return {
      reachable: false,
      error: "An unexpected error occurred while checking agent status.",
    };
  }
}

/**
 * Gets the issuer DID from the agent, creating it if it doesn't exist yet.
 *
 * The flow is:
 * 1. Try to fetch the existing DID — if found, save and return it.
 * 2. If the agent returns 404, create a new DID using the university name as the alias.
 * 3. If creation returns 409 (already exists race), pull the DID from the error
 *    details and save that instead.
 *
 * In all success paths the DID is saved to the university profile and
 * the setup status is updated to `DID_CREATED`.
 */
export async function createOrGetDidAction() {
  const profile = await getUniversityProfile();
  if (!profile) {
    throw new Error("University profile not found.");
  }

  try {
    const { did } = await agentClient.getIssuerDid();
    await prisma.universityProfile.update({
      where: { id: profile.id },
      data: { issuerDid: did, setupStatus: "DID_CREATED" },
    });
    revalidatePath("/setup");
    return { did };
  } catch (error) {
    if (error instanceof AgentServiceError && error.status === 404) {
      // DID doesn't exist, so create it
      try {
        const { did } = await agentClient.createIssuerDid(profile.name);
        await prisma.universityProfile.update({
          where: { id: profile.id },
          data: { issuerDid: did, setupStatus: "DID_CREATED" },
        });
        revalidatePath("/setup");
        return { did };
      } catch (createError) {
        if (
          createError instanceof AgentServiceError &&
          createError.status === 409
        ) {
          const details = createError.details as { did?: string } | undefined;
          if (details?.did) {
            await prisma.universityProfile.update({
              where: { id: profile.id },
              data: { issuerDid: details.did, setupStatus: "DID_CREATED" },
            });
            revalidatePath("/setup");
            return { did: details.did };
          }
        }
        throw new Error(`Failed to create DID: ${createError}`);
      }
    } else if (error instanceof AgentServiceError && error.status === 409) {
      // This case is unlikely if getIssuerDid is used first, but handle it.
      const details = error.details as { did?: string };
      if (details?.did) {
        await prisma.universityProfile.update({
          where: { id: profile.id },
          data: { issuerDid: details.did, setupStatus: "DID_CREATED" },
        });
        revalidatePath("/setup");
        return { did: details.did };
      }
    }
    throw error; // Re-throw other errors
  }
}

const STUDENT_SCHEMA = {
  name: "StudentIdentity",
  version: "1.0",
  attributes: ["studentNumber", "firstName", "lastName", "faculty", "year"],
};

const ISSUANCE_PAYLOAD = {
  schema: STUDENT_SCHEMA,
  credentialDefinition: {
    tag: "default",
    supportRevocation: true,
  },
  revocation: {
    tag: "default-revocation",
    maximumCredentialNumber: 10000,
  },
};

/**
 * Runs the one-time issuance setup on the agent using the fixed student schema.
 * Creates the schema and credential definition on the ledger, saves the resulting
 * IDs to the DB, then marks the university profile setup as complete.
 * Requires a DID to already exist — throws if one hasn't been created yet.
 */
export async function runIssuanceSetupAction() {
  const profile = await getUniversityProfile();
  if (!profile) {
    return { ok: false, error: "University profile not found." };
  }
  if (!profile.issuerDid) {
    return { ok: false, error: "Issuer DID not found. Create the DID first." };
  }

  try {
    const { schemaId, credentialDefinitionId, revocationRegistryDefinitionId } =
      await agentClient.issuanceSetup({
        issuerDid: profile.issuerDid,
        ...ISSUANCE_PAYLOAD,
      });

    await agentClient.registerTrustedCredentialDefinition(credentialDefinitionId, true);

    await createCredentialSchema({
      activatedAt: new Date(),
      universityProfileId: profile.id,
      schemaName: STUDENT_SCHEMA.name,
      schemaVersion: STUDENT_SCHEMA.version,
      schemaAttributes: STUDENT_SCHEMA.attributes,
      schemaId,
      credentialDefinitionId,
      revocationRegistryDefinitionId,
    });

    await prisma.universityProfile.update({
      where: { id: profile.id },
      data: {
        setupStatus: "COMPLETE",
        setupCompletedAt: new Date(),
      },
    });
  } catch (error) {
    if (error instanceof AgentServiceError) {
      console.error("issuanceSetup failed", {
        status: error.status,
        message: error.message,
        details: error.details,
      });
      return {
        ok: false,
        error: `${error.message} (status ${error.status})`,
      };
    }
    console.error("issuanceSetup failed", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Issuance setup failed.",
    };
  }
  revalidatePath("/setup");
  return { ok: true };
}

