import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  encodeLiveVerificationCursor,
  getLiveVerificationEvents,
} from "@/lib/vendors/liveVerifications";

const agent = vi.hoisted(() => ({ getInPersonVerificationDetails: vi.fn() }));
const database = vi.hoisted(() => ({ vendorVerification: { findMany: vi.fn() } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/agentClient", () => agent);
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));

const context = {
  userId: "staff-1",
  vendorProfileId: "vendor-1",
  companyName: "Cafe",
  role: "STAFF" as const,
  branchIds: ["branch-1"],
};
const completedAt = new Date("2026-08-04T12:00:01.000Z");
const verification = {
  id: "verification-1",
  eventId: "event-1",
  verificationRequestId: "request-1",
  branchId: "branch-1",
  servicePointId: "service-point-1",
  servicePointName: "Main Branch",
  status: "APPROVED",
  isVerified: null,
  failureCode: null,
  attributes: null,
  completedAt,
  branch: { id: "branch-1", name: "Main Branch" },
};

describe("live in-person verification feed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("initializes a cursor without replaying old results", async () => {
    const result = await getLiveVerificationEvents(context);
    expect(result.events).toEqual([]);
    expect(result.nextCursor).toBeTruthy();
    expect(database.vendorVerification.findMany).not.toHaveBeenCalled();
  });

  it("returns verified identity without persisting it", async () => {
    database.vendorVerification.findMany.mockResolvedValue([verification]);
    agent.getInPersonVerificationDetails.mockResolvedValue({
      verificationRequestId: "request-1",
      servicePointId: "service-point-1",
      status: "Approved",
      isVerified: true,
      attributes: { firstName: "Ada", lastName: "Lovelace", studentNumber: "STU001" },
    });
    const cursor = encodeLiveVerificationCursor({ completedAt: "2026-08-04T12:00:00.000Z", id: "_" });
    const result = await getLiveVerificationEvents(context, cursor);
    expect(result.events[0]).toMatchObject({ studentName: "Ada Lovelace", studentNumber: "STU001" });
    expect(database.vendorVerification.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ branchId: { in: ["branch-1"] }, checkoutId: null }),
    }));
  });

  it("can narrow the live feed to a notification branch subset", async () => {
    database.vendorVerification.findMany.mockResolvedValue([]);
    const cursor = encodeLiveVerificationCursor({ completedAt: "2026-08-04T12:00:00.000Z", id: "_" });
    await getLiveVerificationEvents(
      { ...context, branchIds: ["branch-1", "branch-2"] },
      cursor,
      { branchIds: ["branch-2"] },
    );

    expect(database.vendorVerification.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ branchId: { in: ["branch-2"] } }),
    }));
  });

  it("uses stored identity metadata before calling the agent fallback", async () => {
    database.vendorVerification.findMany.mockResolvedValue([{
      ...verification,
      isVerified: true,
      attributes: {
        fullName: "Grace Hopper",
        institution: "University of Cape Town",
        studentNumber: "STU002",
      },
    }]);
    const cursor = encodeLiveVerificationCursor({ completedAt: "2026-08-04T12:00:00.000Z", id: "_" });
    const result = await getLiveVerificationEvents(context, cursor);
    expect(result.events[0]).toMatchObject({
      attributes: {
        fullName: "Grace Hopper",
        institution: "University of Cape Town",
        studentNumber: "STU002",
      },
      student: {
        id: "STU002",
        name: "Grace Hopper",
        university: "University of Cape Town",
      },
      studentName: "Grace Hopper",
      studentNumber: "STU002",
      studentUniversity: "University of Cape Town",
    });
    expect(agent.getInPersonVerificationDetails).not.toHaveBeenCalled();
  });

  it("exposes returned metadata even when the proof was not approved", async () => {
    database.vendorVerification.findMany.mockResolvedValue([verification]);
    agent.getInPersonVerificationDetails.mockResolvedValue({
      verificationRequestId: "request-1",
      status: "Declined",
      isVerified: false,
      attributes: { fullName: "Forged Name", studentNumber: "FORGED" },
    });
    const cursor = encodeLiveVerificationCursor({ completedAt: "2026-08-04T12:00:00.000Z", id: "_" });
    const result = await getLiveVerificationEvents(context, cursor);
    expect(result.events[0]).toMatchObject({ studentName: "Forged Name", studentNumber: "FORGED" });
  });
});
