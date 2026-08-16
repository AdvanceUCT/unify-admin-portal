import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

import {
  authenticateVendorApiKey,
  createVendorApiCredential,
  deliverVendorWebhook,
} from "@/lib/vendors/integrations";
import { decryptVendorSecret } from "@/lib/vendors/integrationCrypto";
import { assertSafeWebhookUrl } from "@/lib/vendors/webhookSafety";

const database = vi.hoisted(() => ({
  vendorApiCredential: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  vendorVerification: {
    findUnique: vi.fn(),
  },
  vendorWebhookDelivery: {
    create: vi.fn(),
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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

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

  it("delivers a signed minimal checkout result without identity data", async () => {
    vi.mocked(assertSafeWebhookUrl).mockResolvedValue("https://checkout.example.com/webhooks/unify");
    vi.mocked(decryptVendorSecret).mockReturnValue("vendor-webhook-secret");
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
    database.vendorVerification.findUnique.mockResolvedValue({
      id: "verification-row-001",
      eventId: "event-001",
      verificationRequestId: "verification-001",
      checkoutId: "cart-001",
      status: "APPROVED",
      isVerified: true,
      failureCode: null,
      attributes: {
        firstName: "Ada",
        institution: "University of Cape Town",
        lastName: "Lovelace",
        studentNumber: "STU001",
      },
      schemaId: "schema-should-not-leak",
      credentialDefinitionId: "cred-def-should-not-leak",
      createdAt: new Date("2026-08-03T20:00:00.000Z"),
      expiresAt: new Date("2026-08-03T20:05:00.000Z"),
      completedAt: new Date("2026-08-03T20:02:00.000Z"),
      deliveries: [],
      vendorProfile: {
        webhookConfig: {
          enabled: true,
          signingSecretCiphertext: "ciphertext",
          url: "https://checkout.example.com/webhooks/unify",
        },
      },
    });
    database.vendorWebhookDelivery.create.mockResolvedValue({});

    await deliverVendorWebhook("verification-row-001", "request-001");

    const request = vi.mocked(fetch).mock.calls[0][1];
    const rawBody = request?.body as string;
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    expect(body).toEqual({
      eventId: "event-001",
      verificationRequestId: "verification-001",
      checkoutId: "cart-001",
      status: "APPROVED",
      failureCode: null,
      failureReason: null,
      createdAt: "2026-08-03T20:00:00.000Z",
      expiresAt: "2026-08-03T20:05:00.000Z",
      completedAt: "2026-08-03T20:02:00.000Z",
    });
    expect(body).not.toHaveProperty("isVerified");
    expect(body).not.toHaveProperty("attributes");
    expect(body).not.toHaveProperty("student");

    const headers = new Headers(request?.headers);
    expect(headers.get("X-Request-ID")).toBe("request-001");
    expect(headers.get("X-Unify-Event-Id")).toBe("event-001");
    expect(headers.get("X-Unify-Signature")).toBe(
      `sha256=${createHmac("sha256", "vendor-webhook-secret").update(rawBody).digest("hex")}`,
    );
    expect(database.vendorWebhookDelivery.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "DELIVERED" }),
    }));
  });
});
