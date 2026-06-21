import { ResetPasswordForm } from "./ResetPasswordForm";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{
    token?: string | string[];
    portal?: string | string[];
  }>;
}) {
  const { token, portal } = await searchParams;
  const resetToken = Array.isArray(token) ? token[0] : token;
  const rawPortal = Array.isArray(portal) ? portal[0] : portal;

  return <ResetPasswordForm isVendor={rawPortal === "vendor"} token={resetToken} />;
}
