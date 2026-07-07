import { SectionHeader } from "@/components/layout/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { requireRole } from "@/lib/auth/session";
import { listCredentialSchemas } from "@/lib/university/credentialSchema";
import { getUniversityProfile } from "@/lib/university/profile";
import { createSchemaVersionAction } from "./actions";
import { NewVersionButton } from "./NewVersionButton";

export default async function SchemasPage() {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER", "VIEWER"]);
  const canWrite = session.user.role === "SUPER_ADMIN" || session.user.role === "ADMIN";

  const profile = await getUniversityProfile();
  const schemas = profile ? await listCredentialSchemas(profile.id) : [];
  const activeSchema = schemas.find((schema) => schema.isActive);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Schemas"
        description="Credential schema versions for this issuer. Creating a new version doesn't invalidate credentials already issued."
      />

      {canWrite && activeSchema ? (
        <div className="flex justify-end">
          <NewVersionButton
            action={createSchemaVersionAction}
            currentAttributes={activeSchema.schemaAttributes}
            currentVersion={activeSchema.schemaVersion}
          />
        </div>
      ) : null}

      <section className="rounded-lg border border-zinc-200 bg-white">
        <div className="divide-y divide-zinc-100">
          {schemas.map((schema) => (
            <div key={schema.id} className="px-5 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-zinc-950">
                      {schema.schemaName} · v{schema.schemaVersion}
                    </h2>
                    {schema.isActive ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="neutral">Retired</Badge>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {schema.schemaAttributes.map((attribute) => (
                      <span
                        key={attribute}
                        className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-600"
                      >
                        {attribute}
                      </span>
                    ))}
                  </div>
                </div>
                <p className="shrink-0 text-xs text-zinc-400">
                  Created{" "}
                  {new Date(schema.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>
          ))}

          {schemas.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-zinc-500">
              No schema versions yet. Complete issuance setup first.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
