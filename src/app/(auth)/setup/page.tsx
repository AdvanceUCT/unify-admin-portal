import { redirect } from "next/navigation";
import { getUniversityProfile } from "@/lib/university/profile";
import { getActiveCredentialSchema } from "@/lib/university/credentialSchema";
import { SetupWizard } from "@/features/setup/SetupWizard";

function getInitialStep(
  profile: Awaited<ReturnType<typeof getUniversityProfile>>,
  schema: Awaited<ReturnType<typeof getActiveCredentialSchema>>,
): number {
  if (!profile) {
    return 0; // Profile step
  }
  if (profile.setupStatus === "COMPLETE") {
    redirect("/");
  }
  if (!profile.issuerDid) {
    return 1; // Agent Check step
  }
  if (profile.setupStatus === "DID_CREATED") {
    return 3; // Issuance Setup step
  }
  if (
    profile.setupStatus === "SCHEMA_CREATED" &&
    !schema?.revocationRegistryDefinitionId
  ) {
    return 3; // Issuance Setup step (retry revocation mode)
  }
  // Default to the start if something is inconsistent
  return 0;
}

export default async function SetupPage() {
  const profile = await getUniversityProfile();
  const schema = profile ? await getActiveCredentialSchema(profile.id) : null;

  const initialStep = getInitialStep(profile, schema);

  // A bit of a hack to serialize the Decimal type from prisma
  const serializedProfile = profile
    ? {
        id: profile.id,
        name: profile.name,
        abbreviation: profile.abbreviation,
        logoUrl: profile.logoUrl,
        contactEmail: profile.contactEmail,
        issuerDid: profile.issuerDid,
        setupStatus: profile.setupStatus,
      }
    : null;
  const serializedSchema = schema
    ? {
        schemaId: schema.schemaId,
        credentialDefinitionId: schema.credentialDefinitionId,
        revocationRegistryDefinitionId: schema.revocationRegistryDefinitionId,
      }
    : null;

  return (
    <SetupWizard
      initialStep={initialStep}
      profile={serializedProfile}
      schema={serializedSchema}
    />
  );
}
