import { SignInForm } from "@/app/(public)/sign-in/SignInForm";
import { sanitizeCallbackUrl } from "@/lib/auth/redirects";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    callbackURL?: string | string[];
    inviteAccepted?: string | string[];
  }>;
}) {
  const { callbackURL, inviteAccepted } = await searchParams;
  const rawCallbackURL = Array.isArray(callbackURL) ? callbackURL[0] : callbackURL;
  const wasInviteAccepted = Array.isArray(inviteAccepted)
    ? inviteAccepted[0] === "1"
    : inviteAccepted === "1";

  return (
    <SignInForm
      callbackURL={sanitizeCallbackUrl(rawCallbackURL)}
      notice={wasInviteAccepted ? "Your account was created. Sign in to continue." : undefined}
    />
  );
}
