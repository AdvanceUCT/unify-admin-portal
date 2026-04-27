import { SignInForm } from "@/app/(public)/sign-in/SignInForm";
import { sanitizeCallbackUrl } from "@/lib/auth/redirects";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackURL?: string | string[] }>;
}) {
  const { callbackURL } = await searchParams;
  const rawCallbackURL = Array.isArray(callbackURL) ? callbackURL[0] : callbackURL;

  return <SignInForm callbackURL={sanitizeCallbackUrl(rawCallbackURL)} />;
}
