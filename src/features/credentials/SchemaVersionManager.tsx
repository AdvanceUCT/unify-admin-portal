"use client";

import { LoaderCircle, Plus, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/formatters";

type SchemaAttributeAvailability = {
  available: boolean;
  label: string;
  name: string;
  source: "computed" | "custom" | "system" | "unsupported";
};

type SchemaVersionSummary = {
  attributes: string[];
  createdAt: string;
  credentialDefinitionId?: string | null;
  id: string;
  isActive: boolean;
  publishedAt?: string | null;
  schemaId?: string | null;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  version: string;
};

type SchemaVersionManagerProps = {
  attributeAvailability: SchemaAttributeAvailability[];
  versions: SchemaVersionSummary[];
};

async function responseError(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? `Schema request failed with status ${response.status}.`;
}

function statusBadge(version: SchemaVersionSummary) {
  if (version.status === "ACTIVE" || version.isActive) return <Badge tone="success">Active</Badge>;
  if (version.status === "DRAFT") return <Badge tone="warning">Draft</Badge>;
  return <Badge>Retired</Badge>;
}

function sourceLabel(source: SchemaAttributeAvailability["source"]) {
  if (source === "computed") return "computed";
  if (source === "custom") return "custom CSV field";
  if (source === "system") return "student field";
  return "unsupported";
}

export function SchemaVersionManager({ attributeAvailability, versions }: SchemaVersionManagerProps) {
  const router = useRouter();
  const active = versions.find((version) => version.isActive);
  const [attributes, setAttributes] = useState<string[]>(active?.attributes ?? ["studentNumber"]);
  const [schemaVersion, setSchemaVersion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  function toggleAttribute(attribute: string) {
    if (attribute === "studentNumber") return;
    setAttributes((current) =>
      current.includes(attribute)
        ? current.filter((item) => item !== attribute)
        : attributeAvailability
            .map((item) => item.name)
            .filter((item) => item === "studentNumber" || current.includes(item) || item === attribute),
    );
  }

  async function createDraftVersion() {
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/credentials/schemas", {
        body: JSON.stringify({ attributes, schemaVersion }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error(await responseError(response));

      setMessage(`Draft schema version ${schemaVersion.trim()} created.`);
      setSchemaVersion("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Draft schema creation failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function publishVersion(schemaId: string, version: string) {
    setError(null);
    setMessage(null);
    setPublishingId(schemaId);

    try {
      const response = await fetch("/api/credentials/schemas", {
        body: JSON.stringify({ schemaId }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      if (!response.ok) throw new Error(await responseError(response));

      setMessage(`Schema version ${version} published and activated.`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Schema publishing failed.");
    } finally {
      setPublishingId(null);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-950">Schema history</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Drafts are local. Published versions are registered on the agent and stay available for existing credentials.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">Version</th>
                <th className="px-5 py-3 font-medium">Attributes</th>
                <th className="px-5 py-3 font-medium">Credential definition</th>
                <th className="px-5 py-3 font-medium">Published</th>
                <th className="px-5 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {versions.map((version) => (
                <tr key={version.id}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-950">{version.version}</span>
                      {statusBadge(version)}
                    </div>
                  </td>
                  <td className="max-w-sm px-5 py-4 text-zinc-700">{version.attributes.join(", ")}</td>
                  <td
                    className="max-w-xs truncate px-5 py-4 font-mono text-xs text-zinc-600"
                    title={version.credentialDefinitionId ?? undefined}
                  >
                    {version.credentialDefinitionId ?? "Not registered"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-zinc-600">
                    {version.publishedAt ? formatDateTime(version.publishedAt) : "Local draft"}
                  </td>
                  <td className="px-5 py-4">
                    {version.status === "DRAFT" ? (
                      <button
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 transition hover:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={publishingId !== null}
                        onClick={() => publishVersion(version.id, version.version)}
                        type="button"
                      >
                        {publishingId === version.id ? (
                          <LoaderCircle aria-hidden className="size-4 animate-spin" />
                        ) : (
                          <UploadCloud aria-hidden className="size-4" />
                        )}
                        Publish
                      </button>
                    ) : (
                      <span className="text-sm text-zinc-500">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="h-fit rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-base font-semibold text-zinc-950">Create draft version</h2>
        <p className="mt-1 text-sm leading-5 text-zinc-600">
          Create the schema locally first. Publish it only when every attribute can be populated.
        </p>

        <label className="mt-5 block text-sm font-medium text-zinc-800" htmlFor="schema-version">
          Version
        </label>
        <input
          className="mt-2 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-200"
          disabled={isSubmitting}
          id="schema-version"
          onChange={(event) => setSchemaVersion(event.target.value)}
          placeholder="2.0"
          value={schemaVersion}
        />

        <fieldset className="mt-5">
          <legend className="text-sm font-medium text-zinc-800">Credential attributes</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {attributeAvailability.map((attribute) => (
              <label className="flex min-h-9 items-start gap-2 text-sm text-zinc-700" key={attribute.name}>
                <input
                  checked={attributes.includes(attribute.name)}
                  className="mt-0.5 size-4 rounded border-zinc-300 accent-zinc-950"
                  disabled={isSubmitting || attribute.name === "studentNumber" || !attribute.available}
                  onChange={() => toggleAttribute(attribute.name)}
                  type="checkbox"
                />
                <span>
                  <span className="block">{attribute.name}</span>
                  <span className="block text-xs text-zinc-500">{sourceLabel(attribute.source)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-zinc-950 px-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          disabled={isSubmitting || !schemaVersion.trim() || attributes.length === 0}
          onClick={createDraftVersion}
          type="button"
        >
          {isSubmitting ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Plus aria-hidden className="size-4" />}
          {isSubmitting ? "Creating..." : "Create draft"}
        </button>

        {message ? <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p> : null}
        {error ? <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      </section>
    </div>
  );
}
