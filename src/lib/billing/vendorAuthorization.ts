/**
 * @fileoverview Resolves vendor invoice ownership independently of verification-application approval.
 * @module lib/billing/vendorAuthorization
 */

import "server-only";

import { cache } from "react";
import { forbidden } from "next/navigation";

import { requireVendorSession, requireVendorSessionForRender } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export type VendorInvoiceOwnerContext = {
  userId: string;
  vendorProfileId: string;
  companyName: string;
};

/**
 * Deliberately separate from `getApprovedVendorContextForUser`
 * (`src/lib/vendors/context.ts`), which also requires a currently-`APPROVED`
 * verification application. Invoice ownership must survive that status
 * changing later — an owner who paid invoices last year should still see
 * them even if the vendor's verification approval is later revoked.
 * Resolves strictly from an active `OWNER` `VendorMembership`; never from
 * URL-supplied IDs, branch membership, or the legacy vendor-profile owner
 * field.
 */
async function resolveVendorInvoiceOwnerContext(
  userId: string,
): Promise<VendorInvoiceOwnerContext | null> {
  const membership = await prisma.vendorMembership.findFirst({
    where: { userId, active: true, role: "OWNER" },
    select: {
      vendorProfileId: true,
      vendorProfile: { select: { companyName: true } },
    },
  });
  if (!membership) return null;

  return {
    userId,
    vendorProfileId: membership.vendorProfileId,
    companyName: membership.vendorProfile.companyName,
  };
}

const getVendorInvoiceOwnerContextCachedForRender = cache(resolveVendorInvoiceOwnerContext);

export async function getVendorInvoiceOwnerContext(
  userId: string,
): Promise<VendorInvoiceOwnerContext | null> {
  return resolveVendorInvoiceOwnerContext(userId);
}

export async function getVendorInvoiceOwnerContextForRender(
  userId: string,
): Promise<VendorInvoiceOwnerContext | null> {
  return getVendorInvoiceOwnerContextCachedForRender(userId);
}

/** For Server Component pages: redirects to sign-in or 403s, matching the rest of the vendor portal. */
export async function requireVendorInvoiceOwnerContext() {
  const session = await requireVendorSession();
  const context = await getVendorInvoiceOwnerContext(session.user.id);
  if (!context) forbidden();
  return { session, context };
}

export async function requireVendorInvoiceOwnerContextForRender() {
  const session = await requireVendorSessionForRender();
  const context = await getVendorInvoiceOwnerContextForRender(session.user.id);
  if (!context) forbidden();
  return { session, context };
}
