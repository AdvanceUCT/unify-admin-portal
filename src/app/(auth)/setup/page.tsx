import { getUniversityProfile } from "@/lib/university/profile";
import { SetupWizard } from "@/features/setup/SetupWizard";

export default async function SetupPage() {
  const profile = await getUniversityProfile();

  const serializedProfile = profile
    ? {
        abbreviation: profile.abbreviation,
        contactEmail: profile.contactEmail,
        id: profile.id,
        issuerDid: profile.issuerDid,
        logoUrl: profile.logoUrl,
        name: profile.name,
        setupCompletedAt: profile.setupCompletedAt?.toISOString() ?? null,
        setupStatus: profile.setupStatus,
      }
    : null;

  return <SetupWizard profile={serializedProfile} />;
}
