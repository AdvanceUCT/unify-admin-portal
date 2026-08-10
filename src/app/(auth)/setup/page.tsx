import { getUniversityProfile } from "@/lib/university/profile";
import { SetupWizard } from "@/features/setup/SetupWizard";
import { serializeSetupProfile } from "./actions";

export default async function SetupPage() {
  const profile = await getUniversityProfile();
  const serializedProfile = profile ? await serializeSetupProfile(profile) : null;

  return <SetupWizard profile={serializedProfile} />;
}
