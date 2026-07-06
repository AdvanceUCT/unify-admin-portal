import { SectionHeader } from "@/components/layout/SectionHeader";
import { ImportWizard } from "@/features/imports/ImportWizard";
import { requireRole } from "@/lib/auth/session";
import { getImportFieldDefinitions, getImportMapping } from "@/lib/imports/mapping";
import { getActiveCredentialSchema } from "@/lib/university/credentialSchema";
import { getUniversityProfile } from "@/lib/university/profile";

export default async function StudentsImportPage() {
  await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER"]);

  const profile = await getUniversityProfile();
  const schema = profile ? await getActiveCredentialSchema(profile.id) : null;

  if (!profile || !schema) {
    return (
      <div className="space-y-6">
        <SectionHeader description="Upload a CSV and map its columns to system fields." title="Import students" />
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Complete university setup (profile and credential schema) before importing students.
        </p>
      </div>
    );
  }

  const fieldDefinitions = getImportFieldDefinitions(schema.schemaAttributes);
  const existingMapping = await getImportMapping(profile.id);
  const existingColumnMap = (existingMapping?.columnMap as Record<string, string> | undefined) ?? {};

  return (
    <div className="space-y-6">
      <SectionHeader description="Upload a CSV and map its columns to system fields." title="Import students" />
      <ImportWizard existingColumnMap={existingColumnMap} fieldDefinitions={fieldDefinitions} />
    </div>
  );
}
