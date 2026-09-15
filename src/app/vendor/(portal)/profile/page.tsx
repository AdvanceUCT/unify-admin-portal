/**
 * @fileoverview Renders the approved vendor page at `/vendor/profile`.
 * @module app/vendor/(portal)/profile/page
 */

import { forbidden } from "next/navigation";

import { VendorLogoUpload } from "@/features/vendors/VendorLogoUpload";
import { PayoutDestinationCard } from "@/features/vendors/PayoutDestinationCard";
import { requireVendorSessionForRender } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getVendorPayoutDestinationSummary } from "@/lib/payments/branchOnboarding";
import { getDocumentSignedUrlForRender } from "@/lib/storage/supabase";
import { getApprovedVendorContextForUserForRender } from "@/lib/vendors/context";

import { VendorProfileForm } from "./VendorProfileForm";
import { savePayoutDestinationAction } from "../payments/actions";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function VendorProfilePage({
  searchParams,
}: {
  searchParams: Promise<{
    payout?: string | string[];
    payoutError?: string | string[];
  }>;
}) {
  const session = await requireVendorSessionForRender();
  const context = await getApprovedVendorContextForUserForRender(session.user.id);
  if (context?.role === "STAFF") forbidden();
  const query = await searchParams;
  const profile = await prisma.vendorProfile.findUnique({
    where: { userId: session.user.id },
  });
  const [logoUrl, payoutDestination] = await Promise.all([
    profile?.logoPath
      ? getDocumentSignedUrlForRender(profile.logoPath)
      : Promise.resolve(null),
    context?.role === "OWNER"
      ? getVendorPayoutDestinationSummary(context.vendorProfileId)
      : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
        <p className="mb-3 text-sm font-medium text-fg-muted">
          Organisation logo
        </p>
        <VendorLogoUpload initialLogoUrl={logoUrl} />
      </section>

      <VendorProfileForm
        initialProfile={{
          companyName: profile?.companyName ?? "",
          serviceCategory: profile?.serviceCategory ?? "",
          contactPersonName: profile?.contactPersonName ?? "",
          contactEmail: profile?.contactEmail ?? "",
        }}
      />

      {context?.role === "OWNER" ? (
        <PayoutDestinationCard
          action={savePayoutDestinationAction}
          destinationSummary={payoutDestination ? {
            ...payoutDestination.snapshot,
            provider: payoutDestination.provider,
            reference: payoutDestination.reference,
          } : null}
          hasDestination={Boolean(payoutDestination)}
          payout={firstParam(query.payout)}
          payoutError={firstParam(query.payoutError)}
          returnTo="/vendor/profile"
        />
      ) : null}
    </div>
  );
}
