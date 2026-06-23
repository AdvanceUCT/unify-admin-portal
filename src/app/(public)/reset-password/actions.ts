"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { auth } from "@/lib/auth/auth";

export type ResetPasswordState = {
  status: "idle" | "error";
  message?: string;
};

function getResetErrorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    String(error.code).includes("PASSWORD_TOO_SHORT")
  ) {
    return "Password must be at least 12 characters.";
  }

  return "This reset link is invalid or expired.";
}

export async function resetPasswordAction(
  _previousState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const isVendor = formData.get("portal") === "vendor";

  if (!token) {
    return {
      status: "error",
      message: "This reset link is invalid or expired.",
    };
  }

  if (password.length < 12) {
    return {
      status: "error",
      message: "Password must be at least 12 characters.",
    };
  }

  if (password !== confirmPassword) {
    return {
      status: "error",
      message: "Passwords do not match.",
    };
  }

  try {
    await auth.api.resetPassword({
      body: {
        token,
        newPassword: password,
      },
      headers: await headers(),
    });
  } catch (error) {
    return {
      status: "error",
      message: getResetErrorMessage(error),
    };
  }

  redirect(isVendor ? "/vendor/sign-in" : "/sign-in");
}
