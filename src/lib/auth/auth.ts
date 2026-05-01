import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";

import { AuditAction } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/audit";
import { betterAuthAdminRoles } from "@/lib/auth/permissions";
import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import { sendPasswordResetEmail } from "@/lib/email/password-reset";

const passwordResetTokenExpiresIn = 60 * 60;

export const auth = betterAuth({
  appName: "UNIFY Admin Portal",
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [env.APP_URL],
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: passwordResetTokenExpiresIn,
    revokeSessionsOnPasswordReset: true,
    async sendResetPassword({ user, token }) {
      const resetUrl = new URL("/reset-password", env.APP_URL);
      resetUrl.searchParams.set("token", token);

      await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl: resetUrl.toString(),
        expiresInMinutes: passwordResetTokenExpiresIn / 60,
      });
    },
    async onPasswordReset({ user }, request) {
      await writeAuditLog({
        action: AuditAction.PASSWORD_RESET_COMPLETED,
        actorId: user.id,
        targetType: "user",
        targetId: user.id,
        request,
      });
    },
  },
  session: {
    expiresIn: 8 * 60 * 60,
    updateAge: 60 * 60,
    cookieCache: {
      enabled: false,
    },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    cookiePrefix: "unify-admin",
  },
  databaseHooks: {
    session: {
      create: {
        async after(session, context) {
          await writeAuditLog({
            action: AuditAction.LOGIN_SUCCESS,
            actorId: session.userId,
            targetType: "session",
            targetId: session.id,
            request: context?.request,
          });
        },
      },
      delete: {
        async after(session, context) {
          await writeAuditLog({
            action: AuditAction.LOGOUT,
            actorId: session.userId,
            targetType: "session",
            targetId: session.id,
            request: context?.request,
          });
        },
      },
    },
  },
  plugins: [
    admin({
      defaultRole: "VIEWER",
      adminRoles: ["SUPER_ADMIN"],
      roles: betterAuthAdminRoles,
    }),
  ],
});
