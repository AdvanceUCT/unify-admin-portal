"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import * as agentClient from "@/lib/agentClient";
import { AgentServiceError } from "@/lib/agentClient";
import { assertCan } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import {
  createSchemaVersion,
  getActiveCredentialSchema,
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
 * Creates a new version of the university's active credential schema.
 *
 * Anchors the new schema and credential definition on the ledger, then
 * atomically retires the previously active schema version and records the
 * new one as active. Already-issued credentials reference their credential
 * definition directly, so they remain valid after the old version retires.
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

    await createSchemaVersion({
      profileId: profile.id,
      actorId: session.user.id,
      previousSchemaId: activeSchema.id,
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
