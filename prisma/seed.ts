import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const BOOTSTRAP_ROLE = "SUPER_ADMIN";

async function main() {
  const { auth } = await import("../src/lib/auth/auth");
  const { ADMIN_ROLES } = await import("../src/lib/auth/permissions");
  const { prisma } = await import("../src/lib/db/prisma");
  const { env } = await import("../src/lib/config/env");

  try {
    function isAdminPortalRole(role: string | null) {
      return ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number]);
    }

    if (process.env.NODE_ENV === "production") {
      throw new Error("Refusing to run bootstrap seed in production.");
    }

    const bootstrapEmail = env.BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
    const users = await prisma.user.findMany({
      select: {
        email: true,
        role: true,
      },
    });

    const existingBootstrapUser = users.find(
      (user) => user.email.toLowerCase() === bootstrapEmail,
    );
    const existingDifferentAdmin = users.find(
      (user) =>
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

    await auth.api.createUser({
      body: {
        email: bootstrapEmail,
        name: env.BOOTSTRAP_ADMIN_NAME,
        password: env.BOOTSTRAP_ADMIN_PASSWORD,
        role: BOOTSTRAP_ROLE,
        data: {
          emailVerified: true,
        },
      },
    });

    console.log(`Created bootstrap SUPER_ADMIN: ${bootstrapEmail}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
