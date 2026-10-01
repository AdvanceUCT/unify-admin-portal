import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rows: vi.fn(), update: vi.fn(), source: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { credentialIssuance: { findMany: mocks.rows, updateMany: mocks.update } } }));
vi.mock("@/lib/agentClient", () => ({ getCredentialValidity: mocks.source }));
import { backfillCredentialValidity } from "@/lib/credentials/validityBackfill";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows.mockResolvedValue([{ id: "issuance", credentialExchangeId: "exchange", credentialDefinitionId: "definition", credentialValidFrom: null, credentialExpiresAt: null }]);
  mocks.source.mockResolvedValue({ id: "exchange", credentialDefinitionId: "definition", credentialValidity: { validFrom: "2026-01-01T00:00:00Z", expiresAt: "2027-01-01T00:00:00Z" } });
  mocks.update.mockResolvedValue({ count: 1 });
});
it("defaults to dry-run and applies only bound dates", async () => {
  expect(await backfillCredentialValidity()).toMatchObject({ recoverable: 1, updated: 0 });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(await backfillCredentialValidity({ apply: true })).toMatchObject({ updated: 1 });
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ credentialValidFrom: null, credentialExpiresAt: null }) }));
});
it("does not invent dates or copy from another credential", async () => {
  mocks.source.mockResolvedValueOnce({ id: "wrong", credentialValidity: {} });
  expect(await backfillCredentialValidity({ apply: true })).toMatchObject({ unavailable: 1, updated: 0 });
  expect(mocks.update).not.toHaveBeenCalled();
});
it("is idempotent and protects changes made after the read", async () => {
  mocks.update.mockResolvedValueOnce({ count: 0 });
  expect(await backfillCredentialValidity({ apply: true })).toMatchObject({ updated: 0, conflicting: 1 });
  mocks.rows.mockResolvedValueOnce([]);
  expect(await backfillCredentialValidity({ apply: true })).toMatchObject({ scanned: 0, updated: 0 });
});
