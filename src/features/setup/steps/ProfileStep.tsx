"use client";

import { useState } from "react";
import { saveProfileAction } from "@/app/(auth)/setup/actions";
import type { SetupProfile } from "@/features/setup/SetupWizard";

export function ProfileStep({
  profile,
  onComplete,
}: {
  profile: SetupProfile | null;
  onComplete: () => void;
}) {
  const [name, setName] = useState(profile?.name ?? "");
  const [abbreviation, setAbbreviation] = useState(profile?.abbreviation ?? "");
  const [logoUrl, setLogoUrl] = useState(profile?.logoUrl ?? "");
  const [contactEmail, setContactEmail] = useState(profile?.contactEmail ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!name.trim() || !abbreviation.trim() || !contactEmail.trim()) {
      setError("Name, abbreviation, and contact email are required.");
      return;
    }

    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("abbreviation", abbreviation.trim());
      formData.append("logoUrl", logoUrl.trim());
      formData.append("contactEmail", contactEmail.trim());
      await saveProfileAction(formData);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">University profile</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Add the basic details that identify your institution.
        </p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="font-medium text-zinc-700">University name</span>
            <input
              className="mt-2 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm focus:border-zinc-500 focus:outline-none"
              onChange={(event) => setName(event.target.value)}
              placeholder="University of Example"
              required
              value={name}
            />
          </label>
          <label className="text-sm">
            <span className="font-medium text-zinc-700">Abbreviation</span>
            <input
              className="mt-2 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm focus:border-zinc-500 focus:outline-none"
              onChange={(event) => setAbbreviation(event.target.value)}
              placeholder="UEX"
              required
              value={abbreviation}
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="font-medium text-zinc-700">Contact email</span>
            <input
              className="mt-2 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm focus:border-zinc-500 focus:outline-none"
              onChange={(event) => setContactEmail(event.target.value)}
              placeholder="admin@example.edu"
              required
              type="email"
              value={contactEmail}
            />
          </label>
          <label className="text-sm">
            <span className="font-medium text-zinc-700">Logo URL</span>
            <input
              className="mt-2 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm focus:border-zinc-500 focus:outline-none"
              onChange={(event) => setLogoUrl(event.target.value)}
              placeholder="https://example.edu/logo.png"
              value={logoUrl}
            />
          </label>
        </div>

        {error ? <p className="text-sm text-amber-700">{error}</p> : null}

        <button
          className="h-10 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          disabled={isSaving}
          type="submit"
        >
          {isSaving ? "Saving" : "Save and continue"}
        </button>
      </form>
    </div>
  );
}
