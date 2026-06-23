"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { AuditAction } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/audit/audit";
import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";

const genericResetMessage = "If an account exists, instructions were sent.";

export type ForgotPasswordState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function requestPasswordResetAction(
  _previousState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();
  const isVendor = formData.get("portal") === "vendor";

  if (!email) {
    return {
      status: "error",
      message: "Enter your email address.",
    };
  }

  const user = await prisma.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
    },
  });

  if (!user || user.banned) {
    if (user) {
      await writeAuditLog({
        action: AuditAction.PASSWORD_RESET_REQUESTED,
        actorId: user.id,
        targetType: "user",
        targetId: user.id,
        meta: {
          suppressed: true,
          reason: "deactivated",
        },
      });
    }

    return {
      status: "success",
      message: genericResetMessage,
    };
  }

  const resetUrl = new URL("/reset-password", env.APP_URL);
  if (isVendor) {
    resetUrl.searchParams.set("portal", "vendor");
  }

  await auth.api.requestPasswordReset({
    body: {
      email: user.email,
      redirectTo: resetUrl.toString(),
    },
    headers: await headers(),
  });

  await writeAuditLog({
    action: AuditAction.PASSWORD_RESET_REQUESTED,
    actorId: user.id,
    targetType: "user",
    targetId: user.id,
  });

  revalidatePath("/forgot-password");

  return {
    status: "success",
    message: genericResetMessage,
  };
}
