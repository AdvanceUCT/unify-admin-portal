import { SectionHeader } from "@/components/layout/SectionHeader";
import { ImportWizard } from "@/features/imports/ImportWizard";
import { requireRole } from "@/lib/auth/session";
import { getActiveCustomFieldDefinitions } from "@/lib/imports/customFields";
import { getImportFieldDefinitions, getImportMapping } from "@/lib/imports/mapping";
import { getUniversityProfile } from "@/lib/university/profile";
import { ImportSectionTabs } from "./ImportSectionTabs";

export default async function StudentsImportPage() {
  await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER"]);

  const profile = await getUniversityProfile();

  if (!profile) {
    return (
      <div className="space-y-6">
        <SectionHeader description="Upload a CSV and map its columns to system fields." title="Import students" />
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Complete university setup (profile) before importing students.
        </p>
      </div>
    );
  }

  const customFields = await getActiveCustomFieldDefinitions(profile.id);
  const fieldDefinitions = getImportFieldDefinitions(customFields);
  const existingMapping = await getImportMapping(profile.id);
  const existingColumnMap = (existingMapping?.columnMap as Record<string, string> | undefined) ?? {};

  return (
    <div className="space-y-6">
      <SectionHeader description="Upload a CSV and map its columns to system fields." title="Import students" />
      <ImportSectionTabs active="upload" />
      <ImportWizard existingColumnMap={existingColumnMap} fieldDefinitions={fieldDefinitions} />
    </div>
  );
}
