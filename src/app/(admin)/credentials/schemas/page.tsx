import { SectionHeader } from "@/components/layout/SectionHeader";
import { SchemaVersionManager } from "@/features/credentials/SchemaVersionManager";
import { requireRole } from "@/lib/auth/session";
import {
  listCredentialSchemaVersions,
  SUPPORTED_STUDENT_SCHEMA_ATTRIBUTES,
} from "@/lib/university/credentialSchema";
import { getUniversityProfile } from "@/lib/university/profile";

export default async function CredentialSchemasPage() {
  const [, profile] = await Promise.all([requireRole(["SUPER_ADMIN", "ADMIN"]), getUniversityProfile()]);
  if (!profile) throw new Error("University profile was not found.");

  const versions = await listCredentialSchemaVersions(profile.id);

  return (
    <div className="space-y-6">
      <SectionHeader
        description="Register immutable student credential versions and control the active issuance schema."
        title="Credential Schemas"
      />
      <SchemaVersionManager
        supportedAttributes={SUPPORTED_STUDENT_SCHEMA_ATTRIBUTES}
        versions={versions.map((version) => ({
          attributes: version.schemaAttributes,
          createdAt: version.createdAt.toISOString(),
          credentialDefinitionId: version.credentialDefinitionId,
          id: version.id,
          isActive: version.isActive,
          schemaId: version.schemaId,
          version: version.schemaVersion,
        }))}
      />
    </div>
  );
}
