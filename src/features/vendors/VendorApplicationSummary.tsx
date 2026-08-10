/**
 * @fileoverview Summarizes the current vendor application status and next action.
 * @module features/vendors/VendorApplicationSummary
 */

"use client";

import { useState } from "react";
import { Building2, ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/formatters";
import { toSafeImageSrc } from "@/lib/url";

export function VendorApplicationSummary({
  companyName,
  logoUrl,
  status,
  createdAt,
  decidedAt,
  children,
}: {
  companyName: string;
  logoUrl?: string | null;
  status: "PENDING" | "APPROVED";
  createdAt: Date;
  decidedAt: Date | null;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const safeLogoSrc = toSafeImageSrc(logoUrl);

  const isApproved = status === "APPROVED";
  const message = isApproved
    ? "You're approved and ready to verify student credentials."
    : "Your application is under review. We'll notify you once a decision is made.";

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        {safeLogoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL, not compatible with next/image
          <img
            alt={`${companyName} logo`}
            className="size-14 shrink-0 rounded-lg border border-border bg-surface-muted object-contain p-1.5"
            src={safeLogoSrc}
          />
        ) : (
          <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
            <Building2 size={24} aria-hidden="true" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-section-title text-fg">{companyName}</h1>
            <Badge tone={isApproved ? "success" : "warning"}>
              {isApproved ? "Approved" : "Pending review"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-fg-muted">{message}</p>
          <p className="mt-2 text-xs text-fg-subtle">
            Submitted {formatDateTime(createdAt.toISOString())}
            {decidedAt ? ` · Decided ${formatDateTime(decidedAt.toISOString())}` : ""}
          </p>
        </div>

        {/*
          The label stays fixed ("Details") rather than swapping to "Hide
          details" — text that changes length shifts the flex row's width at
          the exact moment it toggles, which read as the whole card jittering.
          Only the chevron animates now.
        */}
        <button
          aria-expanded={expanded}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
          onClick={() => setExpanded((prev) => !prev)}
          type="button"
        >
          Details
          <ChevronDown
            aria-hidden="true"
            className={cn("size-4 transition-transform", expanded && "rotate-180")}
          />
        </button>
      </div>

      {/*
        A CSS grid-rows transition (0fr -> 1fr) animates to/from an unknown
        content height without measuring it in JS — the classic fixed
        max-height trick either clips tall content or leaves a pause before
        collapse. Content stays mounted (not conditionally rendered) so the
        transition has something to measure; `inert` while collapsed keeps
        it out of tab order instead of leaving off-screen links focusable.
      */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-in-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden" inert={!expanded}>
          <div className="border-t border-border p-5">{children}</div>
        </div>
      </div>
    </div>
  );
}
