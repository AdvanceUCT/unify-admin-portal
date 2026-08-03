import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  authenticateVendorApiKey,
  createVendorApiCredential,
} from "@/lib/vendors/integrations";

const database = vi.hoisted(() => ({
  vendorApiCredential: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));
vi.mock("@/lib/vendors/integrationCrypto", () => ({
  decryptVendorSecret: vi.fn(),
  encryptVendorSecret: vi.fn(),
  hashVendorApiKey: vi.fn(() => "stored-api-key-hash"),
}));
vi.mock("@/lib/vendors/webhookSafety", () => ({ assertSafeWebhookUrl: vi.fn() }));

describe("vendor API credentials", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a token once while persisting only its keyed hash", async () => {
    database.vendorApiCredential.create.mockImplementation(async ({ data }) => ({
      id: "credential-001",
      name: data.name,
      createdAt: new Date("2026-08-03T20:00:00.000Z"),
    }));

    const result = await createVendorApiCredential("vendor-001", " Production ");

    expect(result.token).toMatch(/^unify_vk_[a-f0-9]{12}_[A-Za-z0-9_-]{43}$/);
    const createInput = database.vendorApiCredential.create.mock.calls[0][0];
    expect(createInput.data).toMatchObject({
      vendorProfileId: "vendor-001",
      name: "Production",
      keyHash: "stored-api-key-hash",
    });
    expect(JSON.stringify(createInput.data)).not.toContain(result.token);
  });

  it("authenticates an active key for an approved vendor", async () => {
    const token = "unify_vk_abcdef123456_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";
    const vendorProfile = { id: "vendor-001", applications: [{ id: "approved-application" }] };
    database.vendorApiCredential.findUnique.mockResolvedValue({
      id: "credential-001",
      keyHash: "stored-api-key-hash",
      revokedAt: null,
      vendorProfile,
    });
    database.vendorApiCredential.update.mockResolvedValue({});

    await expect(authenticateVendorApiKey(`Bearer ${token}`)).resolves.toBe(vendorProfile);
    expect(database.vendorApiCredential.update).toHaveBeenCalledWith({
      where: { id: "credential-001" },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it("rejects malformed and revoked credentials", async () => {
    await expect(authenticateVendorApiKey("Bearer not-a-vendor-key")).resolves.toBeNull();
    expect(database.vendorApiCredential.findUnique).not.toHaveBeenCalled();

    database.vendorApiCredential.findUnique.mockResolvedValue({
      id: "credential-001",
      keyHash: "stored-api-key-hash",
      revokedAt: new Date(),
      vendorProfile: { applications: [{ id: "approved-application" }] },
    });
    await expect(
      authenticateVendorApiKey(
        "Bearer unify_vk_abcdef123456_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
      ),
    ).resolves.toBeNull();
  });
});
