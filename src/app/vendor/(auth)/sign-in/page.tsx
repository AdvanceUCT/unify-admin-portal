import { redirect } from "next/navigation";

import { VendorSignInForm } from "@/app/vendor/(auth)/sign-in/VendorSignInForm";
import { sanitizeCallbackUrl } from "@/lib/auth/redirects";
import { getCurrentVendorSession } from "@/lib/auth/session";

export default async function VendorSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackURL?: string | string[] }>;
}) {
  const session = await getCurrentVendorSession();

  if (session?.user.userType === "VENDOR") {
    redirect("/vendor");
  }

  const { callbackURL } = await searchParams;
  const rawCallbackURL = Array.isArray(callbackURL) ? callbackURL[0] : callbackURL;

  return (
    <VendorSignInForm callbackURL={sanitizeCallbackUrl(rawCallbackURL, "/vendor")} />
  );
}
