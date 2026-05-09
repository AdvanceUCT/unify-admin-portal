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
import { selectStudentRecordsForCredentialIssuance } from "@/lib/student-records/simulatedUniversityRecords";

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
    const issuableStudents = selectStudentRecordsForCredentialIssuance(mockStudents);
    const result = await queueBatchIssuance();

    expect(result.status).toBe("Queued");
    expect(result.issuedCredentialIds).toEqual(issuableStudents.map((student) => student.credential.id));
    expect(result.activationDeliveries).toHaveLength(issuableStudents.length);
    expect(result.activationDeliveries[0]).toMatchObject({
      batchId: "batch-001",
      channel: "activation-link",
      credentialId: issuableStudents[0].credential.id,
      studentId: issuableStudents[0].profile.id,
      status: "Delivered",
    });
    expect(result.activationDeliveries[0].activationUrl).toMatch(/^unifywallet:\/\/activate\?token=/);
  });

  it("records activation link delivery audit events when queueing a batch", async () => {
    await queueBatchIssuance();
    const events = await getAuditEvents();

    expect(events.filter((event) => event.eventType === "ActivationLinkDelivered")).toHaveLength(1);
  });

  it("does not derive activation links from student names or numbers", async () => {
    await queueBatchIssuance();
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
