/*
 * This seed file sets up the first admin user for the app.
 * It checks the env details, makes sure we are not in production,
 * and creates the bootstrap SUPER_ADMIN login if it does not exist yet.
 */
import { config } from "dotenv";
import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";

import { ADMIN_ROLES } from "@/lib/auth/roles";

config({ path: ".env.local" });
config({ path: ".env" });

const BOOTSTRAP_ROLE = "SUPER_ADMIN";

async function main() {
  const { prisma } = await import("../src/lib/db/prisma");
  const { env } = await import("../src/lib/config/env");

  try {
    function isAdminPortalRole(role: string | null) {
      return ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number]);
    }

    if (process.env.NODE_ENV === "production") {
      throw new Error("Refusing to run bootstrap seed in production.");
    }
console.log("process.env.BOOTSTRAP_ADMIN_EMAIL =", process.env.BOOTSTRAP_ADMIN_EMAIL);
console.log("env.BOOTSTRAP_ADMIN_EMAIL =", env.BOOTSTRAP_ADMIN_EMAIL);
    const bootstrapEmail = env.BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
    const users = await prisma.user.findMany({
      select: {
        email: true,
        role: true,
      },
    });

    const existingBootstrapUser = users.find(
      (user: { email: string; }) => user.email.toLowerCase() === bootstrapEmail,
    );
    const existingDifferentAdmin = users.find(
      (user: { email: string; role: string | null; }) =>
        user.email.toLowerCase() !== bootstrapEmail &&
        isAdminPortalRole(user.role),
    );

    if (existingDifferentAdmin) {
      throw new Error(
        `Refusing to bootstrap ${bootstrapEmail}; admin user ${existingDifferentAdmin.email} already exists.`,
      );
    }

    if (existingBootstrapUser) {
      if (existingBootstrapUser.role !== BOOTSTRAP_ROLE) {
        throw new Error(
          `Bootstrap user ${bootstrapEmail} already exists with role ${existingBootstrapUser.role ?? "none"}.`,
        );
      }

      console.log(`Bootstrap SUPER_ADMIN already exists: ${bootstrapEmail}`);
      return;
    }

    const passwordHash = await hashPassword(env.BOOTSTRAP_ADMIN_PASSWORD);
    const now = new Date();
    const userId = randomUUID();

    await prisma.$transaction([
      prisma.user.create({
        data: {
          id: userId,
          email: bootstrapEmail,
          name: env.BOOTSTRAP_ADMIN_NAME,
          emailVerified: true,
          role: BOOTSTRAP_ROLE,
          userType: "ADMIN",
          createdAt: now,
          updatedAt: now,
        },
      }),
      prisma.account.create({
        data: {
          id: randomUUID(),
          accountId: userId,
          providerId: "credential",
          userId,
          password: passwordHash,
          createdAt: now,
          updatedAt: now,
        },
      }),
    ]);

    console.log(`Created bootstrap SUPER_ADMIN: ${bootstrapEmail}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
