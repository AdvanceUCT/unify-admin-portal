"use client";

import { LoaderCircle, Plus, Trash2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Dialog } from "@/components/ui/Dialog";
import { StatusText, type StatusTone } from "@/components/ui/StatusText";
import { cn } from "@/lib/cn";
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

const SOURCE_GROUPS: { source: SchemaAttributeAvailability["source"]; label: string }[] = [
  { source: "system", label: "Student fields" },
  { source: "computed", label: "Computed fields" },
  { source: "custom", label: "Custom CSV fields" },
  { source: "unsupported", label: "Unsupported" },
];

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

  const [pendingDelete, setPendingDelete] = useState<SchemaVersionSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Shared with the history panel banner — set by either a successful publish or delete.
  const [historyMessage, setHistoryMessage] = useState<string | null>(null);

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
    setHistoryMessage(null);
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

      setHistoryMessage(`Schema version ${pendingPublish.version} published and activated.`);
      setPendingPublish(null);
      router.refresh();
    } catch (caught) {
      setPublishError(caught instanceof Error ? caught.message : "Schema publishing failed.");
    } finally {
      setIsPublishing(false);
    }
  }

  function openDeleteDialog(version: SchemaVersionSummary) {
    setDeleteError(null);
    setHistoryMessage(null);
    setPendingDelete(version);
  }

  function closeDeleteDialog() {
    if (isDeleting) return;
    setPendingDelete(null);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteError(null);
    setIsDeleting(true);

    try {
      const response = await fetch("/api/credentials/schemas", {
        body: JSON.stringify({ schemaId: pendingDelete.id }),
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await responseError(response));

      setHistoryMessage(`Draft schema version ${pendingDelete.version} deleted.`);
      setPendingDelete(null);
      router.refresh();
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : "Schema draft deletion failed.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Schema history — a card per version, not a table. The attribute list
          is the one field with genuinely variable, often-long content; a
          table column forces either horizontal scroll or truncation, while
          wrapped tags read fine at any width. Low cardinality (versions are
          few) is exactly the case a card list suits better than a dense grid. */}
      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Schema history</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Drafts are local. Published versions are registered on the agent and stay available for existing credentials.
          </p>
          {historyMessage ? (
            <p className="mt-4 rounded-md border border-success-border bg-success-bg px-3 py-2 text-sm text-success-fg">
              {historyMessage}
            </p>
          ) : null}
        </div>

        {versions.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-fg-subtle">No schema versions yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {versions.map((version) => {
              const isVersionActive = version.status === "ACTIVE" || version.isActive;

              return (
                <div
                  className={cn(
                    "relative px-5 py-4 pl-6 transition hover:bg-surface-muted/60",
                    "before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-['']",
                    isVersionActive ? "before:bg-success-fg" : "before:bg-transparent",
                  )}
                  key={version.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-semibold tabular-nums text-fg">v{version.version}</span>
                      <StatusText tone={statusTone(version)}>{statusLabel(version)}</StatusText>
                    </div>
                    {version.status === "DRAFT" ? (
                      <div className="flex items-center gap-2">
                        <button
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-danger-border bg-danger-bg px-3 text-sm font-medium text-danger-fg transition hover:bg-danger-border"
                          onClick={() => openDeleteDialog(version)}
                          type="button"
                        >
                          <Trash2 aria-hidden className="size-4" />
                          Delete
                        </button>
                        <button
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
                          onClick={() => openPublishDialog(version)}
                          type="button"
                        >
                          <UploadCloud aria-hidden className="size-4" />
                          Publish
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {version.attributes.map((attribute) => (
                      <span
                        className="rounded-md bg-surface-muted px-2 py-1 text-xs font-medium text-fg-muted"
                        key={attribute}
                      >
                        {attribute}
                      </span>
                    ))}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-subtle">
                    <span
                      className="max-w-xs truncate font-mono"
                      title={version.credentialDefinitionId ?? undefined}
                    >
                      {version.credentialDefinitionId ?? "Not registered"}
                    </span>
                    <span className="tabular-nums">
                      {version.publishedAt ? formatDateTime(version.publishedAt) : "Local draft"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Create draft — full width, up top: it's the thing you do most often
          and the attribute picker needs the room. Grouped by source (student
          field / computed / custom) rather than one flat list, so a large
          field set stays scannable instead of becoming an undifferentiated
          checkbox wall. */}
      <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
        <h2 className="text-section-title text-fg">Create draft version</h2>
        <p className="mt-1 text-sm leading-5 text-fg-muted">
          Create the schema locally first. Publish it only when every attribute can be populated.
        </p>

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <div className="w-full max-w-48">
            <label className="block text-sm font-medium text-fg" htmlFor="schema-version">
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
          </div>
          <button
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle"
            disabled={isSubmitting || !schemaVersion.trim() || attributes.length === 0}
            onClick={createDraftVersion}
            type="button"
          >
            {isSubmitting ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Plus aria-hidden className="size-4" />}
            {isSubmitting ? "Creating..." : "Create draft"}
          </button>
          <span className="text-sm text-fg-subtle">
            {attributes.length} attribute{attributes.length === 1 ? "" : "s"} selected
          </span>
        </div>

        <fieldset className="mt-6 space-y-5">
          <legend className="text-sm font-medium text-fg">Credential attributes</legend>
          {SOURCE_GROUPS.map(({ source, label }) => {
            const groupAttributes = attributeAvailability.filter((attribute) => attribute.source === source);
            if (groupAttributes.length === 0) return null;

            return (
              <div key={source}>
                <p className="text-caption font-medium uppercase tracking-wide text-fg-subtle">{label}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {groupAttributes.map((attribute) => {
                    const isChecked = attributes.includes(attribute.name);
                    const isMandatory = attribute.name === "studentNumber";
                    const isDisabled = isSubmitting || isMandatory || !attribute.available;

                    return (
                      <label
                        className={cn(
                          "flex h-10 items-center gap-2 rounded-md border px-3 text-sm transition",
                          isChecked
                            ? "border-brand-300 bg-brand-50 text-brand-800"
                            : "border-border bg-surface text-fg-muted hover:border-border-strong hover:bg-surface-muted",
                          isDisabled && !isChecked && "cursor-not-allowed opacity-50",
                        )}
                        key={attribute.name}
                      >
                        <input
                          checked={isChecked}
                          className="size-4 shrink-0 rounded border-border accent-brand-600"
                          disabled={isDisabled}
                          onChange={() => toggleAttribute(attribute.name)}
                          type="checkbox"
                        />
                        <span className="truncate">{attribute.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </fieldset>

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

      <Dialog
        isOpen={pendingDelete !== null}
        onClose={closeDeleteDialog}
        title={pendingDelete ? `Delete draft v${pendingDelete.version}` : "Delete draft"}
      >
        {pendingDelete ? (
          <div className="space-y-4">
            <p className="text-sm text-fg-muted">
              This permanently deletes the local draft v{pendingDelete.version}. It was never
              published, so nothing depends on it — but this cannot be undone.
            </p>
            {deleteError ? (
              <p className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg">
                {deleteError}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg disabled:opacity-50"
                disabled={isDeleting}
                onClick={closeDeleteDialog}
                type="button"
              >
                Cancel
              </button>
              <button
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-danger-fg px-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isDeleting}
                onClick={confirmDelete}
                type="button"
              >
                {isDeleting ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
                Confirm and delete
              </button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
