import { SectionHeader } from "@/components/layout/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { requireRole } from "@/lib/auth/session";
import { getActiveCustomFieldDefinitions } from "@/lib/imports/customFields";
import { isRequiredByActiveSchema, SYSTEM_FIELDS } from "@/lib/imports/mapping";
import { getActiveCredentialSchema } from "@/lib/university/credentialSchema";
import { getUniversityProfile } from "@/lib/university/profile";
import { ImportSectionTabs } from "../ImportSectionTabs";
import { AddCustomFieldForm } from "./AddCustomFieldForm";
import { RemoveCustomFieldButton } from "./RemoveCustomFieldButton";

export default async function ManageFieldsPage() {
  await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER"]);

  const profile = await getUniversityProfile();

  if (!profile) {
    return (
      <div className="space-y-6">
        <SectionHeader description="View and manage system and custom import fields." title="Manage fields" />
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Complete university setup (profile) before managing import fields.
        </p>
      </div>
    );
  }

  const [customFields, schema] = await Promise.all([
    getActiveCustomFieldDefinitions(profile.id),
    getActiveCredentialSchema(profile.id),
  ]);

  return (
    <div className="space-y-8">
      <SectionHeader description="View and manage system and custom import fields." title="Manage fields" />
      <ImportSectionTabs active="fields" />

      <section className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-950">System fields</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Fixed and required on every import. These can&apos;t be renamed or removed.
          </p>
        </div>
        <div className="divide-y divide-zinc-100">
          {SYSTEM_FIELDS.map((field) => (
            <div className="flex items-center justify-between px-5 py-3 text-sm" key={field.name}>
              <span className="font-medium text-zinc-800">{field.label}</span>
              <span className="text-xs text-zinc-500">{field.name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-950">Custom fields</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Admin-defined. Once added, a field must be mapped (and given a value on every row) on every future
            import, same as a system field. Removing a field never deletes data already stored under it — it only
            stops being a mapping target for future imports.
          </p>
        </div>
        <div className="divide-y divide-zinc-100">
          {customFields.map((field) => {
            const dependsOnSchema = schema ? isRequiredByActiveSchema(field.key, schema.schemaAttributes) : false;

            return (
              <div className="flex items-center justify-between px-5 py-3 text-sm" key={field.id}>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-800">{field.label}</span>
                  <span className="text-xs text-zinc-500">{field.key}</span>
                  {dependsOnSchema ? <Badge tone="warning">Required by active credential schema</Badge> : null}
                </div>
                <RemoveCustomFieldButton
                  fieldKey={field.key}
                  requiresConfirmation={dependsOnSchema}
                  warning={`"${field.key}" is required by your active credential schema; removing it means new students can't be issued a credential until this is resolved. Remove anyway?`}
                />
              </div>
            );
          })}
          {customFields.length === 0 ? (
            <p className="px-5 py-6 text-sm text-zinc-500">No custom fields yet — add one below.</p>
          ) : null}
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader description="Add a new custom field as a future mapping target." title="Add custom field" />
        <AddCustomFieldForm />
      </section>
    </div>
  );
}
