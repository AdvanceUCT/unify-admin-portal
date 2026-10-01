import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("@/lib/config/env", () => ({ env: { DATABASE_URL: process.env.DATABASE_URL, PAYMENT_WALLET_TOPUPS_ENABLED: true, PAYMENT_OTP_BYPASS_ENABLED: true, CREDENTIAL_VALIDITY_LEGACY_DEFINITION_IDS: "ci-legacy-definition" } }));
import { prisma } from "@/lib/db/prisma";
import { requestStudentPaymentActivation, authenticateWalletBearer, refreshStudentPaymentSession } from "@/lib/payments/walletSession";
const now = new Date("2026-10-01T10:00:00Z");
let universityId: string;
beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL ?? "http://invalid").pathname !== "/unify_wallet_test" || process.env.NODE_ENV === "production") throw new Error("Requires isolated CI database");
  let profile = await prisma.universityProfile.findFirst();
  if (!profile) profile = await prisma.universityProfile.create({ data: { name: "CI", abbreviation: "CI", contactEmail: "ci@example.invalid", paymentWalletEnabled: true } });
  universityId = profile.id;
});
afterAll(async () => prisma.$disconnect());
async function student() {
  const id = randomUUID();
  await prisma.student.create({ data: { id, studentNumber: id.toUpperCase(), email: "ci@example.invalid", firstName: "CI", lastName: "Validity" } });
  return id;
}
const activate = (id: string) => requestStudentPaymentActivation({ studentNumber: id, deviceId: "ci-device", now });
it.each([
  ["valid", -1, 1, true], ["at-start", 0, 1, true], ["expired", -1, -1, false], ["at-expiry", -1, 0, false], ["future", 1, 2, false], ["reversed", 2, 1, false],
] as const)("enforces %s validity at authoritative activation time", async (_, start, end, eligible) => {
  const id = await student();
  await prisma.credentialIssuance.create({ data: { studentId: id, credentialDefinitionId: "ci-modern", status: "ISSUED", lifecycleStatus: "ACTIVE", credentialValidFrom: new Date(now.getTime() + start), credentialExpiresAt: new Date(now.getTime() + end) } });
  if (eligible) await expect(activate(id)).resolves.toHaveProperty("sessionId");
  else await expect(activate(id)).rejects.toMatchObject({ code: "PAYMENT_WALLET_NOT_ELIGIBLE" });
});
it("allows confirmed legacy schemas but rejects modern missing dates", async () => {
  await prisma.credentialSchema.create({ data: { universityProfileId: universityId, schemaName: randomUUID(), credentialDefinitionId: "ci-legacy-definition", schemaAttributes: ["studentNumber"] } });
  const legacy = await student(), modern = await student();
  for (const [studentId, definition] of [[legacy, "ci-legacy-definition"], [modern, "ci-modern"]]) await prisma.credentialIssuance.create({ data: { studentId, credentialDefinitionId: definition, status: "ISSUED", lifecycleStatus: "ACTIVE" } });
  await expect(activate(legacy)).resolves.toHaveProperty("sessionId");
  await expect(activate(modern)).rejects.toMatchObject({ code: "PAYMENT_WALLET_NOT_ELIGIBLE" });
});
it("existing sessions and refresh remain usable after expiry and suspension", async () => {
  const id = await student();
  const issuance = await prisma.credentialIssuance.create({ data: { studentId: id, credentialDefinitionId: "ci-modern", status: "ISSUED", lifecycleStatus: "ACTIVE", credentialValidFrom: new Date(now.getTime() - 1000), credentialExpiresAt: new Date(now.getTime() + 1000) } });
  const session = await activate(id);
  if (!("accessToken" in session)) throw new Error("Expected session");
  await prisma.credentialIssuance.update({ where: { id: issuance.id }, data: { credentialExpiresAt: now, lifecycleStatus: "SUSPENDED" } });
  await expect(authenticateWalletBearer(new Request("https://ci.invalid", { headers: { authorization: `Bearer ${session.accessToken}` } }), now)).resolves.toMatchObject({ studentId: id });
  await expect(refreshStudentPaymentSession({ refreshToken: session.refreshToken, sessionId: session.sessionId, deviceId: "ci-device", now })).resolves.toHaveProperty("accessToken");
  await expect(activate(id)).rejects.toMatchObject({ code: "PAYMENT_WALLET_NOT_ELIGIBLE" });
});
