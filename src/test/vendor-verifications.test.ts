import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createVendorCheckoutSession,
  getVendorVerificationResult,
  listRecentVendorVerifications,
  recordVerificationCompletedEvent,
} from "@/lib/vendors/verifications";

const agent = vi.hoisted(() => ({
  createCheckoutVerificationSession: vi.fn(),
  getInPersonVerificationDetails: vi.fn(),
  getVerificationResult: vi.fn(),
}));
const database = vi.hoisted(() => ({
  vendorProfile: { findUnique: vi.fn() },
  vendorBranch: { findFirst: vi.fn() },
  vendorVerification: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  },
}));
const applications = vi.hoisted(() => ({ ensureVendorVerificationServicePoint: vi.fn() }));
const integrations = vi.hoisted(() => ({ deliverVendorWebhook: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/agentClient", () => agent);
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));
vi.mock("@/lib/vendors/applications", () => applications);
vi.mock("@/lib/vendors/integrations", () => integrations);

const completedEvent = {
  type: "verification.completed" as const,
  eventId: "verification-001:Approved",
  verificationRequestId: "verification-001",
  checkoutId: "cart-001",
  vendorId: "vendor-001",
  servicePointId: "service-point-001",
  decision: "Approved" as const,
  isVerified: true,
  attributes: {
    firstName: "Ada",
    institution: "University of Cape Town",
    lastName: "Lovelace",
    studentNumber: "STU001",
  },
  expiresAt: "2026-08-03T20:05:00.000Z",
  completedAt: "2026-08-03T20:02:00.000Z",
  timestamp: "2026-08-03T20:02:00.000Z",
};

describe("vendor checkout verification", () => {
  beforeEach(() => vi.clearAllMocks());

  it("binds a new agent session to the vendor checkout id", async () => {
    applications.ensureVendorVerificationServicePoint.mockResolvedValue(undefined);
    database.vendorProfile.findUnique.mockResolvedValue({
      id: "vendor-001",
      companyName: "Library Cafe",
      defaultBranch: {
        id: "branch-001",
        name: "Main Branch",
        agentServicePointId: "service-point-001",
      },
    });
    agent.createCheckoutVerificationSession.mockResolvedValue({
      verificationRequestId: "verification-001",
      checkoutId: "cart-001",
      verificationUrl: "https://voskuils.com/verify/checkout/verification-001?token=claim-token",
      status: "Pending",
      createdAt: "2026-08-03T20:00:00.000Z",
      expiresAt: "2026-08-03T20:05:00.000Z",
    });
    database.vendorVerification.upsert.mockResolvedValue({
      verificationRequestId: "verification-001",
      checkoutId: "cart-001",
      status: "PENDING",
      failureCode: null,
      createdAt: new Date("2026-08-03T20:00:00.000Z"),
      expiresAt: new Date("2026-08-03T20:05:00.000Z"),
      completedAt: null,
    });

    const result = await createVendorCheckoutSession("vendor-001", " cart-001 ");

    expect(agent.createCheckoutVerificationSession).toHaveBeenCalledWith({
      vendorId: "vendor-001",
      servicePointId: "service-point-001",
      checkoutId: "cart-001",
    });
    expect(database.vendorVerification.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { vendorProfileId_checkoutId: { vendorProfileId: "vendor-001", checkoutId: "cart-001" } },
    }));
    expect(result).toMatchObject({ checkoutId: "cart-001", status: "PENDING" });
  });

  it("rejects a signed event that conflicts with the stored checkout binding", async () => {
    database.vendorVerification.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        vendorProfileId: "another-vendor",
        servicePointId: "service-point-001",
        checkoutId: "cart-001",
      });

    await expect(recordVerificationCompletedEvent(completedEvent)).rejects.toThrow(
      "does not match the stored checkout binding",
    );
    expect(database.vendorVerification.upsert).not.toHaveBeenCalled();
    expect(integrations.deliverVendorWebhook).not.toHaveBeenCalled();
  });

  it("records a terminal result and makes one immediate webhook attempt", async () => {
    database.vendorVerification.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        vendorProfileId: "vendor-001",
        servicePointId: "service-point-001",
        checkoutId: "cart-001",
      });
    database.vendorBranch.findFirst.mockResolvedValue({ id: "branch-001", name: "Main Branch" });
    database.vendorVerification.upsert.mockResolvedValue({ id: "stored-verification-001", checkoutId: "cart-001" });
    integrations.deliverVendorWebhook.mockResolvedValue({ skipped: false, status: "DELIVERED" });

    const result = await recordVerificationCompletedEvent(completedEvent);

    expect(result.duplicate).toBe(false);
    expect(database.vendorVerification.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { verificationRequestId: "verification-001" },
      create: expect.objectContaining({
        attributes: completedEvent.attributes,
        isVerified: true,
        status: "APPROVED",
      }),
      update: expect.objectContaining({
        attributes: completedEvent.attributes,
        eventId: completedEvent.eventId,
        isVerified: true,
        status: "APPROVED",
      }),
    }));
    expect(integrations.deliverVendorWebhook).toHaveBeenCalledTimes(1);
    expect(integrations.deliverVendorWebhook).toHaveBeenCalledWith("stored-verification-001", undefined);
  });

  it("hydrates missing webhook metadata from the agent details endpoint before storing", async () => {
    database.vendorVerification.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    database.vendorBranch.findFirst.mockResolvedValue({ id: "branch-001", name: "Main Branch" });
    agent.getInPersonVerificationDetails.mockResolvedValue({
      verificationRequestId: "verification-001",
      servicePointId: "service-point-001",
      status: "Approved",
      isVerified: true,
      attributes: {
        fullName: "Grace Hopper",
        institution: "University of Cape Town",
        studentNumber: "STU002",
      },
    });
    database.vendorVerification.upsert.mockResolvedValue({ id: "stored-verification-001", checkoutId: null });

    await recordVerificationCompletedEvent({ ...completedEvent, attributes: undefined, isVerified: undefined });

    expect(database.vendorVerification.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        attributes: {
          fullName: "Grace Hopper",
          institution: "University of Cape Town",
          studentNumber: "STU002",
        },
        isVerified: true,
      }),
      update: expect.objectContaining({
        attributes: {
          fullName: "Grace Hopper",
          institution: "University of Cape Town",
          studentNumber: "STU002",
        },
        isVerified: true,
      }),
    }));
  });

  it("returns vendor-facing metadata without schema identifiers", async () => {
    database.vendorVerification.findFirst.mockResolvedValue({
      id: "stored-verification-001",
      vendorProfileId: "vendor-001",
      branchId: "branch-001",
      verificationRequestId: "verification-001",
      checkoutId: "cart-001",
      eventId: "event-001",
      servicePointId: "service-point-001",
      servicePointName: "Main Branch",
      status: "APPROVED",
      isVerified: true,
      failureCode: null,
      attributes: completedEvent.attributes,
      schemaId: "schema-should-not-leak",
      credentialDefinitionId: "cred-def-should-not-leak",
      createdAt: new Date("2026-08-03T20:00:00.000Z"),
      updatedAt: new Date("2026-08-03T20:02:00.000Z"),
      completedAt: new Date("2026-08-03T20:02:00.000Z"),
      expiresAt: new Date("2026-08-03T20:05:00.000Z"),
    });

    const result = await getVendorVerificationResult("vendor-001", "verification-001");

    expect(result).toMatchObject({
      attributes: completedEvent.attributes,
      isVerified: true,
      student: {
        id: "STU001",
        name: "Ada Lovelace",
        university: "University of Cape Town",
      },
    });
    expect(result).not.toHaveProperty("schemaId");
    expect(result).not.toHaveProperty("credentialDefinitionId");
  });

  it("enriches recent in-person rows that do not have stored attributes", async () => {
    database.vendorVerification.findMany.mockResolvedValue([{
      id: "stored-verification-001",
      vendorProfileId: "vendor-001",
      branchId: "branch-001",
      verificationRequestId: "verification-001",
      checkoutId: null,
      eventId: "event-001",
      servicePointId: "service-point-001",
      servicePointName: "Main Branch",
      status: "APPROVED",
      isVerified: null,
      failureCode: null,
      attributes: null,
      schemaId: null,
      credentialDefinitionId: null,
      createdAt: new Date("2026-08-03T20:00:00.000Z"),
      updatedAt: new Date("2026-08-03T20:02:00.000Z"),
      completedAt: new Date("2026-08-03T20:02:00.000Z"),
      expiresAt: new Date("2026-08-03T20:05:00.000Z"),
      deliveries: [],
    }]);
    agent.getInPersonVerificationDetails.mockResolvedValue({
      verificationRequestId: "verification-001",
      servicePointId: "service-point-001",
      status: "Approved",
      isVerified: true,
      attributes: {
        firstName: "Ada",
        institution: "University of Cape Town",
        lastName: "Lovelace",
        studentNumber: "STU001",
      },
    });
    const result = await listRecentVendorVerifications("vendor-001", 10, { inPersonOnly: true });

    expect(result[0]).toMatchObject({
      attributes: {
        firstName: "Ada",
        institution: "University of Cape Town",
        lastName: "Lovelace",
        studentNumber: "STU001",
      },
      isVerified: true,
    });
  });
});
