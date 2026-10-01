import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("@/lib/config/env", () => ({ env: { DATABASE_URL: process.env.DATABASE_URL } }));
vi.mock("@/lib/agentClient", () => ({ changeCredentialLifecycle: vi.fn(), getCredentialLifecycle: vi.fn() }));
import { changeCredentialLifecycle, getCredentialLifecycle } from "@/lib/agentClient";
import { prisma } from "@/lib/db/prisma";
import { recordCredentialLifecycleChangedEvent, requestCredentialLifecycleChange } from "@/lib/credentials/lifecycleActions";
import type { CredentialLifecycleChangedWebhookPayload } from "@/lib/credentials/statusMapping";
const timestamp = "2026-10-01T10:00:00Z";
beforeAll(() => {
  if (new URL(process.env.DATABASE_URL ?? "http://invalid").pathname !== "/unify_wallet_test" || process.env.NODE_ENV === "production") throw new Error("Requires isolated CI database");
});
afterAll(async () => prisma.$disconnect());
async function fixture() {
  const id = randomUUID();
  const row = await prisma.credentialIssuance.create({ data: { studentId: id, credentialDefinitionId: id, credentialExchangeId: id, credentialRevocationId: id, revocationRegistryDefinitionId: id, status: "ISSUED", lifecycleStatus: "ACTIVE" } });
  const event = (revision: number, status: "ACTIVE" | "SUSPENDED" | "REVOKED"): CredentialLifecycleChangedWebhookPayload => ({ type: "credential.lifecycleChanged", credentialExchangeId: id, credentialRevocationId: id, revocationRegistryDefinitionId: id, eventId: `${id}:${revision}`, revision, previousStatus: "ACTIVE", status, timestamp });
  return { id, row, event };
}
it("orders reversed and concurrent events independently of equal timestamps", async () => {
  const { id, event } = await fixture();
  await Promise.all([recordCredentialLifecycleChangedEvent(event(2, "ACTIVE")), recordCredentialLifecycleChangedEvent(event(1, "SUSPENDED"))]);
  await recordCredentialLifecycleChangedEvent(event(1, "SUSPENDED"));
  const row = await prisma.credentialIssuance.findUniqueOrThrow({ where: { credentialExchangeId: id } });
  expect(row).toMatchObject({ lifecycleRevision: 2, lifecycleStatus: "ACTIVE" });
  expect(await prisma.credentialAuditLog.count({ where: { eventId: `${id}:1` } })).toBe(1);
  await expect(recordCredentialLifecycleChangedEvent({ ...event(2, "SUSPENDED"), eventId: `${id}:conflict` })).rejects.toMatchObject({ status: 409 });
});
it("keeps revocation terminal, including stale issuance writes", async () => {
  const { id, row, event } = await fixture();
  await recordCredentialLifecycleChangedEvent(event(3, "REVOKED"));
  await recordCredentialLifecycleChangedEvent(event(2, "ACTIVE"));
  await expect(recordCredentialLifecycleChangedEvent(event(4, "ACTIVE"))).rejects.toMatchObject({ status: 409 });
  await prisma.credentialIssuance.update({ where: { id: row.id }, data: { status: "ISSUED", lifecycleStatus: "ACTIVE" } });
  expect(await prisma.credentialIssuance.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: "REVOKED", lifecycleStatus: "REVOKED", lifecycleRevision: 3 });
});
it("enriches a webhook-first suspension without replaying state or scheduling stale work", async () => {
  const { id, row, event } = await fixture();
  const suspension = event(1, "SUSPENDED");
  vi.mocked(changeCredentialLifecycle).mockImplementationOnce(async () => {
    await recordCredentialLifecycleChangedEvent(suspension);
    return { ...suspension, updatedAt: timestamp };
  });
  await requestCredentialLifecycleChange({ action: "suspend", actorId: "ci-admin", studentId: id, credentialIssuanceId: row.id, reason: "CI", reactivateAt: new Date("2099-01-01Z") });
  expect(await prisma.credentialAuditLog.findUnique({ where: { eventId: suspension.eventId } })).toMatchObject({ actorId: "ci-admin" });
  expect(await prisma.credentialAutomationJob.count({ where: { credentialIssuanceId: row.id, status: "PENDING" } })).toBe(1);
  await recordCredentialLifecycleChangedEvent(event(2, "ACTIVE"));
  await recordCredentialLifecycleChangedEvent(suspension);
  expect(await prisma.credentialAutomationJob.count({ where: { credentialIssuanceId: row.id, status: "PENDING" } })).toBe(0);
});
it("reconciles revisionless payloads from a current snapshot and fails closed without one", async () => {
  const { id, event } = await fixture();
  const legacy = { ...event(1, "SUSPENDED"), revision: undefined };
  vi.mocked(getCredentialLifecycle).mockResolvedValueOnce({ ...event(4, "ACTIVE"), updatedAt: timestamp });
  await recordCredentialLifecycleChangedEvent(legacy);
  expect(await prisma.credentialIssuance.findUniqueOrThrow({ where: { credentialExchangeId: id } })).toMatchObject({ lifecycleStatus: "ACTIVE", lifecycleRevision: 4 });
  vi.mocked(getCredentialLifecycle).mockRejectedValueOnce(new Error("offline"));
  await expect(recordCredentialLifecycleChangedEvent(legacy)).rejects.toMatchObject({ status: 503 });
});
