import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";

import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";

export const ADMIN_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "ISSUER",
  "VIEWER",
] as const;

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    admin({
      defaultRole: "VIEWER",
      adminRoles: ["SUPER_ADMIN"],
      roles: {
        SUPER_ADMIN: adminAc,
        ADMIN: userAc,
        ISSUER: userAc,
        VIEWER: userAc,
      },
    }),
  ],
});
