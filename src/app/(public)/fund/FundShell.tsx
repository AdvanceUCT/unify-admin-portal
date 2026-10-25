/**
 * @fileoverview Public page frame for the funder pages, branded with the university name and logo.
 * @module app/(public)/fund/FundShell
 */

import { BackButton } from "@/components/ui/BackButton";
import type { UniversityProfile } from "@/generated/prisma/client";
import { getDocumentSignedUrlForRender } from "@/lib/storage/supabase";
import { toSafeImageSrc } from "@/lib/url";

export async function FundShell({
  children,
  profile,
  width = "narrow",
}: {
  children: React.ReactNode;
  profile: Pick<UniversityProfile, "name" | "logoPath"> | null;
  width?: "narrow" | "wide";
}) {
  const logoSrc = profile?.logoPath ? toSafeImageSrc(await getDocumentSignedUrlForRender(profile.logoPath)) : null;
  const universityName = profile?.name ?? "UNIFY";

  return (
    <main className="min-h-screen bg-canvas px-4 py-10 sm:px-6">
      <div className={`mx-auto w-full space-y-6 ${width === "wide" ? "max-w-2xl" : "max-w-md"}`}>
        <BackButton href="/" label="Back to home" />
        <header className="flex items-center gap-3">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL, not compatible with next/image
            <img alt="" className="size-10 shrink-0 rounded-full border border-border bg-white object-contain p-0.5" src={logoSrc} />
          ) : (
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-[linear-gradient(180deg,var(--sidebar-from),var(--sidebar-to))] text-lg font-semibold text-white"
            >
              {universityName.trim().charAt(0).toUpperCase() || "U"}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-fg-subtle">UNIFY Student Wallet</p>
            <p className="truncate text-section-title text-fg">{universityName}</p>
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}
