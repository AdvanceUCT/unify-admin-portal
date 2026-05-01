import { ResetPasswordForm } from "./ResetPasswordForm";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{
    token?: string | string[];
  }>;
}) {
  const { token } = await searchParams;
  const resetToken = Array.isArray(token) ? token[0] : token;

  return <ResetPasswordForm token={resetToken} />;
}
