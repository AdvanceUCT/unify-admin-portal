/**
 * @fileoverview Renders the public portal page at `/forgot-password`.
 * @module app/(public)/forgot-password/page
 */

import { ForgotPasswordForm } from "./ForgotPasswordForm";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ portal?: string | string[] }>;
}) {
  const { portal } = await searchParams;
  const rawPortal = Array.isArray(portal) ? portal[0] : portal;

  return <ForgotPasswordForm isVendor={rawPortal === "vendor"} />;
}
