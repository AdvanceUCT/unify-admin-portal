import { prisma } from "@/lib/db/prisma";

/** All suites sharing this database must use its single institution. */
export async function ensurePaymentTestUniversity() {
  const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
  if (
    !["/unify_wallet_test", "/pos_test"].includes(database.pathname) ||
    !["localhost", "127.0.0.1"].includes(database.hostname) ||
    process.env.NODE_ENV === "production"
  ) {
    throw new Error("Requires an isolated local payment test database.");
  }

  const profiles = await prisma.universityProfile.findMany({ take: 2 });
  if (profiles.length > 1) {
    throw new Error("Payment test fixtures require exactly one university.");
  }
  if (profiles[0]) {
    return prisma.universityProfile.update({
      where: { id: profiles[0].id },
      data: { paymentWalletEnabled: true },
    });
  }
  return prisma.universityProfile.create({
    data: {
      id: "pos-test-university",
      name: "Test University",
      abbreviation: "TEST",
      contactEmail: "test@example.invalid",
      paymentWalletEnabled: true,
    },
  });
}
