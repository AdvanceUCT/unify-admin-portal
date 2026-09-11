/**
 * @fileoverview Renders the administrator setup page at `/setup`.
 * @module app/(auth)/setup/page
 */

import { getUniversityProfileForRender } from "@/lib/university/profile";
import { SetupWizard } from "@/features/setup/SetupWizard";
import { serializeSetupProfile } from "./actions";

export default async function SetupPage() {
  const profile = await getUniversityProfileForRender();
  const serializedProfile = profile ? await serializeSetupProfile(profile) : null;

  return <SetupWizard profile={serializedProfile} />;
}
