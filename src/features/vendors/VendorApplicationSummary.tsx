"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
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
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-md sm:flex-row sm:items-center">
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

        <button
          className="shrink-0 text-sm font-medium text-fg-muted underline underline-offset-2 hover:text-fg"
          onClick={() => setExpanded((prev) => !prev)}
          type="button"
        >
          {expanded ? "Hide details" : "View full details"}
        </button>
      </div>

      {expanded ? children : null}
    </div>
  );
}
