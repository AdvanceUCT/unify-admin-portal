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

function toHttpsOrigin(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  return value.startsWith("http://") || value.startsWith("https://")
    ? value
    : `https://${value}`;
}

const vercelDeploymentOrigin = toHttpsOrigin(process.env.VERCEL_URL);
const vercelBranchOrigin = toHttpsOrigin(process.env.VERCEL_BRANCH_URL);
const authBaseURL =
  process.env.VERCEL_ENV === "preview" && vercelDeploymentOrigin
    ? vercelDeploymentOrigin
    : env.BETTER_AUTH_URL;
const configuredTrustedOrigins = Array.from(
  new Set(
    [
      env.APP_URL,
      env.BETTER_AUTH_URL,
      authBaseURL,
      vercelDeploymentOrigin,
      vercelBranchOrigin,
    ].filter((origin): origin is string => Boolean(origin)),
  ),
);

function trustedOrigins(request?: Request) {
  let requestOrigin: string | undefined;

  if (request) {
    try {
      requestOrigin = new URL(request.url).origin;
    } catch {
      // Better Auth can initialize without a valid request URL in server-side calls.
    }
  }

  return Array.from(
    new Set([...configuredTrustedOrigins, requestOrigin].filter((origin): origin is string => Boolean(origin))),
  );
}

/**
 * BetterAuth instance shared by the admin portal and the vendor portal.
 *
 * Admin sign-up stays invite-only in practice even though the underlying
 * `emailAndPassword` sign-up endpoint is enabled (vendors need it for
 * self-registration): `userType` defaults to `"VENDOR"` and cannot be set by
 * the client (`input: false`), and the `user.create.before` hook below nulls
 * `role` for any non-`"ADMIN"` user, so a public sign-up can never grant an
 * admin role. Admin accounts are only ever created server-side via
 * `auth.api.createUser` with an explicit `userType: "ADMIN"`.
 *
 * Sessions expire after 8 hours and cookie caching is off so every request
 * hits the DB to validate the session. Login and logout are audited via
 * database hooks.
 */
export const auth = betterAuth({
  appName: "UNIFY Admin Portal",
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: authBaseURL,
  trustedOrigins,
  user: {
    additionalFields: {
      userType: {
        type: "string",
        required: false,
        input: false,
        defaultValue: "VENDOR",
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: passwordResetTokenExpiresIn,
    revokeSessionsOnPasswordReset: true,
    async sendResetPassword({ user, token, url }) {
      // `url` is Better Auth's own callback link, which embeds whatever
      // `redirectTo` was passed to `requestPasswordReset` (including any
      // extra query params, like `portal=vendor`) as its `callbackURL`
      // param. Recover it so the emailed link still lands on the portal the
      // reset was requested from, without taking the extra Better Auth
      // redirect hop.
      const callbackURL = new URL(url).searchParams.get("callbackURL");
      const resetUrl = callbackURL
        ? new URL(callbackURL)
        : new URL("/reset-password", env.APP_URL);
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
    user: {
      create: {
        // Runs after the admin plugin's own `before` hook (which assigns
        // `defaultRole` to any user without a role), so this can safely
        // strip that default back off for non-admin user types.
        async before(user) {
          if (user.userType !== "ADMIN") {
            return { data: { role: null } };
          }
        },
      },
    },
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
