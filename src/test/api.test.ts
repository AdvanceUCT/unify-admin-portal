import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getActivationDeliveries,
  getAuditEvents,
  getBatchIssuancePreview,
  getStudents,
  getVendors,
  queueBatchIssuance,
} from "@/lib/api/client";
import { mockStudents } from "@/lib/api/mockData";
import { resetMockActivationStore } from "@/lib/api/mockActivationStore";

describe("admin mock client", () => {
  afterEach(() => {
    resetMockActivationStore();
    vi.unstubAllGlobals();
  });

  function mockJsonFetch(data: unknown) {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );

    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("returns contract-shaped student credential data", async () => {
    const fetchMock = mockJsonFetch(mockStudents);
    const students = await getStudents();

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/students");
    expect(students[0].credential.validFrom).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(students[0].credential.lifecycleState).toBe("Active");
  });

  it("returns vendor approval data", async () => {
    const vendors = await getVendors();

    expect(vendors.map((vendor) => vendor.status)).toContain("Pending");
  });

  it("returns the planned MVP batch size", async () => {
    const preview = await getBatchIssuancePreview();

    expect(preview.requestedCount).toBe(100);
  });

  it("returns delivered activation links for queued batch issuance", async () => {
    const result = await queueBatchIssuance();

    expect(result.status).toBe("Queued");
    expect(result.issuedCredentialIds).toEqual(["credential-demo-002"]);
    expect(result.activationDeliveries).toHaveLength(1);
    expect(result.activationDeliveries[0]).toMatchObject({
      activationId: "activation-7MFK2Q9V",
      batchId: "batch-001",
      channel: "activation-link",
      credentialId: "credential-demo-002",
      studentId: "student-demo-002",
      status: "Delivered",
    });
    expect(result.activationDeliveries[0].activationUrl).toMatch(/^unifywallet:\/\/activate\?token=/);
  });

  it("records activation link delivery audit events when queueing a batch", async () => {
    await queueBatchIssuance();
    const events = await getAuditEvents();

    expect(events.some((event) => event.eventType === "ActivationLinkDelivered")).toBe(true);
  });

  it("does not derive activation links from student names or numbers", async () => {
    const deliveries = await getActivationDeliveries();
    const activationUrls = deliveries.map((delivery) => delivery.activationUrl).join("\n");

    for (const student of mockStudents) {
      const fullName = `${student.profile.firstName} ${student.profile.lastName}`;
      expect(activationUrls).not.toContain(fullName);
      expect(activationUrls).not.toContain(encodeURIComponent(fullName));
      expect(activationUrls).not.toContain(student.profile.firstName);
      expect(activationUrls).not.toContain(student.profile.lastName);
      expect(activationUrls).not.toContain(student.credential.studentNumber);
    }
  });
});
