/**
 * @fileoverview Accepts the roster file and extracts its source columns.
 * @module features/imports/steps/UploadStep
 */

"use client";

import { useState } from "react";

async function readErrorMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? `Upload failed with status ${response.status}.`;
}

export function UploadStep({ onUploaded }: { onUploaded: (file: File, columns: string[]) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!file) {
      setError("Choose a CSV file to upload.");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/students/import/upload", {
        body: formData,
        cache: "no-store",
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const result = (await response.json()) as { columns: string[] };
      onUploaded(file, result.columns);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-section-title text-fg">Upload student CSV</h2>
        <p className="mt-1 text-body text-fg-muted">
          Choose the CSV file exported from your student records system. You&apos;ll map its columns to system
          fields next.
        </p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <input
          accept=".csv,text/csv"
          className="block w-full text-sm text-fg-muted file:mr-4 file:h-10 file:rounded-md file:border file:border-border file:bg-surface file:px-4 file:text-sm file:font-medium file:text-fg-muted hover:file:bg-surface-muted"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          type="file"
        />

        {error ? <p className="text-sm text-danger-fg">{error}</p> : null}

        <button
          className="h-10 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isUploading}
          type="submit"
        >
          {isUploading ? "Uploading" : "Upload and continue"}
        </button>
      </form>
    </div>
  );
}
