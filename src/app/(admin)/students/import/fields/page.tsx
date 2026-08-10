/**
 * @fileoverview Renders the authenticated administrator page at `/students/import/fields`.
 * @module app/(admin)/students/import/fields/page
 */

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
        <p className="rounded-md border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-fg">
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

      <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-md">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">System fields</h2>
          <p className="mt-1 text-body text-fg-muted">
            Fixed and required on every import. These can&apos;t be renamed or removed.
          </p>
        </div>
        <div className="divide-y divide-border">
          {SYSTEM_FIELDS.map((field) => (
            <div className="flex items-center justify-between px-5 py-3 text-body" key={field.name}>
              <span className="font-medium text-fg">{field.label}</span>
              <span className="text-caption text-fg-subtle">{field.name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-md">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Custom fields</h2>
          <p className="mt-1 text-body text-fg-muted">
            Admin-defined. Once added, a field must be mapped (and given a value on every row) on every future
            import, same as a system field. Removing a field never deletes data already stored under it — it only
            stops being a mapping target for future imports.
          </p>
        </div>
        <div className="divide-y divide-border">
          {customFields.map((field) => {
            const dependsOnSchema = schema ? isRequiredByActiveSchema(field.key, schema.schemaAttributes) : false;

            return (
              <div className="flex items-center justify-between px-5 py-3 text-body" key={field.id}>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-fg">{field.label}</span>
                  <span className="text-caption text-fg-subtle">{field.key}</span>
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
            <p className="px-5 py-6 text-body text-fg-subtle">No custom fields yet — add one below.</p>
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
