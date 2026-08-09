import { SchemaVersionManager } from "@/features/credentials/SchemaVersionManager";
import { requireRole } from "@/lib/auth/session";
import {
  getSchemaAttributeAvailability,
  listCredentialSchemaVersions,
} from "@/lib/university/credentialSchema";
import { getUniversityProfile } from "@/lib/university/profile";

export default async function CredentialSchemasPage() {
  const [, profile] = await Promise.all([requireRole(["SUPER_ADMIN", "ADMIN"]), getUniversityProfile()]);
  if (!profile) throw new Error("University profile was not found.");

  const [versions, attributeAvailability] = await Promise.all([
    listCredentialSchemaVersions(profile.id),
    getSchemaAttributeAvailability(profile.id),
  ]);

  return (
    <SchemaVersionManager
      attributeAvailability={attributeAvailability}
      versions={versions.map((version) => ({
        attributes: version.schemaAttributes,
        createdAt: version.createdAt.toISOString(),
        credentialDefinitionId: version.credentialDefinitionId,
        id: version.id,
        isActive: version.isActive,
        publishedAt: version.publishedAt?.toISOString() ?? null,
        schemaId: version.schemaId,
        status: version.status,
        version: version.schemaVersion,
      }))}
    />
  );
}
