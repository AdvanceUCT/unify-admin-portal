import { afterEach, describe, expect, it } from "vitest";
import {
  getActivationDeliveries,
  getAuditEvents,
  getBatchIssuancePreview,
  getStudents,
  getVendors,
  queueBatchIssuance,
} from "@/lib/api/client";
import { resetMockActivationStore } from "@/lib/api/mockActivationStore";

describe("admin mock client", () => {
  afterEach(() => {
    resetMockActivationStore();
  });

  it("returns contract-shaped student credential data", async () => {
    const students = await getStudents();

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
    const [students, deliveries] = await Promise.all([getStudents(), getActivationDeliveries()]);
    const activationUrls = deliveries.map((delivery) => delivery.activationUrl).join("\n");

    for (const student of students) {
      expect(activationUrls).not.toContain(student.profile.name);
      expect(activationUrls).not.toContain(encodeURIComponent(student.profile.name));
      expect(activationUrls).not.toContain(student.credential.studentNumber);
    }
  });
});
