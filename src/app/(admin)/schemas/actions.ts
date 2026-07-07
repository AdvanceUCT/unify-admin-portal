"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import * as agentClient from "@/lib/agentClient";
import { AgentServiceError } from "@/lib/agentClient";
import { assertCan } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import {
  createDraftSchemaVersion,
  getActiveCredentialSchema,
  publishCredentialSchema,
} from "@/lib/university/credentialSchema";
import { getUniversityProfile } from "@/lib/university/profile";
import {
  schemaAttributesSchema,
  schemaVersionSchema,
} from "@/lib/university/schemaValidation";

const newVersionSchema = z.object({
  version: schemaVersionSchema,
  attributes: schemaAttributesSchema,
});

/**
 * Creates a new draft version of the university's credential schema.
 *
 * Anchors the new schema and credential definition on the ledger, then
 * saves it as a draft alongside the currently active version. The draft
 * has no effect on issuance until an admin explicitly publishes it via
 * `publishSchemaVersionAction`.
 */
export async function createSchemaVersionAction(formData: FormData) {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  assertCan("schema:write", session);

  const parsed = newVersionSchema.safeParse({
    version: formData.get("version"),
    attributes: formData.get("attributes"),
  });

  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Invalid schema version data.",
    );
  }

  const profile = await getUniversityProfile();
  if (!profile) {
    throw new Error("University profile not found.");
  }
  if (!profile.issuerDid) {
    throw new Error("Issuer DID not found. Complete issuance setup first.");
  }

  const activeSchema = await getActiveCredentialSchema(profile.id);
  if (!activeSchema) {
    throw new Error("No active schema found. Complete issuance setup first.");
  }
  if (activeSchema.schemaVersion === parsed.data.version) {
    throw new Error(
      `Version ${parsed.data.version} is already the active version.`,
    );
  }

  try {
    const { schemaId, credentialDefinitionId, revocationRegistryDefinitionId } =
      await agentClient.issuanceSetup({
        issuerDid: profile.issuerDid,
        schema: {
          name: activeSchema.schemaName,
          version: parsed.data.version,
          attributes: parsed.data.attributes,
        },
        credentialDefinition: {
          tag: "default",
          supportRevocation: false,
        },
      });

    await createDraftSchemaVersion({
      profileId: profile.id,
      actorId: session.user.id,
      schemaName: activeSchema.schemaName,
      schemaVersion: parsed.data.version,
      schemaAttributes: parsed.data.attributes,
      schemaId,
      credentialDefinitionId,
      revocationRegistryDefinitionId,
    });
  } catch (error) {
    if (error instanceof AgentServiceError) {
      throw new Error(
        `${error.message} (status ${error.status}) — details: ${JSON.stringify(error.details)}`,
      );
    }
    throw error;
  }

  revalidatePath("/schemas");
}

/**
 * Publishes a draft schema version, making it the active schema for the
 * university. Atomically retires the previously active version so that
 * new credential issuance immediately uses the newly published one.
 */
export async function publishSchemaVersionAction(formData: FormData) {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  assertCan("schema:write", session);

  const schemaId = formData.get("schemaId");
  if (typeof schemaId !== "string" || !schemaId) {
    throw new Error("Schema version is required.");
  }

  const profile = await getUniversityProfile();
  if (!profile) {
    throw new Error("University profile not found.");
  }

  await publishCredentialSchema({
    schemaId,
    profileId: profile.id,
    actorId: session.user.id,
  });

  revalidatePath("/schemas");
}
