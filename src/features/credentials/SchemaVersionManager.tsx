"use client";

import { LoaderCircle, Plus, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Dialog } from "@/components/ui/Dialog";
import { StatusText, type StatusTone } from "@/components/ui/StatusText";
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

function statusTone(version: SchemaVersionSummary): StatusTone {
  if (version.status === "ACTIVE" || version.isActive) return "success";
  if (version.status === "DRAFT") return "warning";
  return "neutral";
}

function statusLabel(version: SchemaVersionSummary) {
  if (version.status === "ACTIVE" || version.isActive) return "Active";
  if (version.status === "DRAFT") return "Draft";
  return "Retired";
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

  const [pendingPublish, setPendingPublish] = useState<SchemaVersionSummary | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);

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

  function openPublishDialog(version: SchemaVersionSummary) {
    setPublishError(null);
    setPublishMessage(null);
    setPendingPublish(version);
  }

  function closePublishDialog() {
    if (isPublishing) return;
    setPendingPublish(null);
  }

  async function confirmPublish() {
    if (!pendingPublish) return;
    setPublishError(null);
    setIsPublishing(true);

    try {
      const response = await fetch("/api/credentials/schemas", {
        body: JSON.stringify({ schemaId: pendingPublish.id }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      if (!response.ok) throw new Error(await responseError(response));

      setPublishMessage(`Schema version ${pendingPublish.version} published and activated.`);
      setPendingPublish(null);
      router.refresh();
    } catch (caught) {
      setPublishError(caught instanceof Error ? caught.message : "Schema publishing failed.");
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Schema history</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Drafts are local. Published versions are registered on the agent and stay available for existing credentials.
          </p>
          {publishMessage ? (
            <p className="mt-4 rounded-md border border-success-border bg-success-bg px-3 py-2 text-sm text-success-fg">
              {publishMessage}
            </p>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-center text-body">
            <thead className="border-b border-border">
              <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                <th className="px-5 py-3 font-medium">Version</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Attributes</th>
                <th className="px-5 py-3 font-medium">Credential definition</th>
                <th className="px-5 py-3 font-medium">Published</th>
                <th className="px-5 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {versions.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-fg-subtle" colSpan={6}>
                    No schema versions yet.
                  </td>
                </tr>
              ) : (
                versions.map((version) => (
                  <tr className="transition hover:bg-surface-muted/60" key={version.id}>
                    <td className="px-5 py-4 font-medium tabular-nums text-fg">{version.version}</td>
                    <td className="px-5 py-4">
                      <StatusText tone={statusTone(version)}>{statusLabel(version)}</StatusText>
                    </td>
                    <td className="max-w-sm px-5 py-4 text-fg-muted">{version.attributes.join(", ")}</td>
                    <td
                      className="max-w-xs truncate px-5 py-4 font-mono text-xs text-fg-subtle"
                      title={version.credentialDefinitionId ?? undefined}
                    >
                      {version.credentialDefinitionId ?? "Not registered"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 tabular-nums text-fg-muted">
                      {version.publishedAt ? formatDateTime(version.publishedAt) : "Local draft"}
                    </td>
                    <td className="px-5 py-4">
                      {version.status === "DRAFT" ? (
                        <button
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
                          onClick={() => openPublishDialog(version)}
                          type="button"
                        >
                          <UploadCloud aria-hidden className="size-4" />
                          Publish
                        </button>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="h-fit rounded-xl border border-border bg-surface p-5 shadow-md">
        <h2 className="text-section-title text-fg">Create draft version</h2>
        <p className="mt-1 text-sm leading-5 text-fg-muted">
          Create the schema locally first. Publish it only when every attribute can be populated.
        </p>

        <label className="mt-5 block text-sm font-medium text-fg" htmlFor="schema-version">
          Version
        </label>
        <input
          className="mt-2 h-10 w-full rounded-md border border-border px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          disabled={isSubmitting}
          id="schema-version"
          onChange={(event) => setSchemaVersion(event.target.value)}
          placeholder="2.0"
          value={schemaVersion}
        />

        <fieldset className="mt-5">
          <legend className="text-sm font-medium text-fg">Credential attributes</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {attributeAvailability.map((attribute) => (
              <label className="flex min-h-9 items-start gap-2 text-sm text-fg-muted" key={attribute.name}>
                <input
                  checked={attributes.includes(attribute.name)}
                  className="mt-0.5 size-4 rounded border-border accent-brand-600"
                  disabled={isSubmitting || attribute.name === "studentNumber" || !attribute.available}
                  onChange={() => toggleAttribute(attribute.name)}
                  type="checkbox"
                />
                <span>
                  <span className="block text-fg">{attribute.name}</span>
                  <span className="block text-xs text-fg-subtle">{sourceLabel(attribute.source)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-3 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle"
          disabled={isSubmitting || !schemaVersion.trim() || attributes.length === 0}
          onClick={createDraftVersion}
          type="button"
        >
          {isSubmitting ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Plus aria-hidden className="size-4" />}
          {isSubmitting ? "Creating..." : "Create draft"}
        </button>

        {message ? (
          <p className="mt-4 rounded-md border border-success-border bg-success-bg px-3 py-2 text-sm text-success-fg">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg">
            {error}
          </p>
        ) : null}
      </section>

      <Dialog
        isOpen={pendingPublish !== null}
        onClose={closePublishDialog}
        title={pendingPublish ? `Publish schema v${pendingPublish.version}` : "Publish schema"}
      >
        {pendingPublish ? (
          <div className="space-y-4">
            <p className="text-sm text-fg-muted">
              This registers v{pendingPublish.version} on the ledger
              {active ? ` and retires the currently active v${active.version}` : ""}. This cannot be
              undone.
            </p>
            {publishError ? (
              <p className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg">
                {publishError}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg disabled:opacity-50"
                disabled={isPublishing}
                onClick={closePublishDialog}
                type="button"
              >
                Cancel
              </button>
              <button
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-brand-600 px-3 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isPublishing}
                onClick={confirmPublish}
                type="button"
              >
                {isPublishing ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
                Confirm and publish
              </button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
