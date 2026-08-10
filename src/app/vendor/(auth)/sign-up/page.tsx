/**
 * @fileoverview Renders the vendor authentication page at `/vendor/sign-up`.
 * @module app/vendor/(auth)/sign-up/page
 */

import { redirect } from "next/navigation";

import { VendorSignUpForm } from "@/app/vendor/(auth)/sign-up/VendorSignUpForm";
import { getCurrentVendorSession } from "@/lib/auth/session";

export default async function VendorSignUpPage() {
  const session = await getCurrentVendorSession();

  if (session?.user.userType === "VENDOR") {
    redirect("/vendor");
  }

  return <VendorSignUpForm />;
}
