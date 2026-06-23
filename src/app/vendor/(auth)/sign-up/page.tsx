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
