import { describe, expect, it } from "vitest";
import {
  formatActivationDeliveryStatus,
  formatCredentialActivityEventStatus,
  formatCredentialAuditAction,
  formatCredentialStatus,
  formatDateTime,
  formatEventType,
} from "@/lib/formatters";

describe("formatters", () => {
  it("formats ISO timestamps", () => {
    expect(formatDateTime("2026-01-01T00:00:00Z")).toContain("2026");
  });

  it("formats credential statuses", () => {
    expect(formatCredentialStatus("ACTIVE")).toBe("Active");
    expect(formatCredentialStatus("LEGACY_NON_REVOCABLE")).toBe("Legacy non-revocable");
    expect(formatCredentialStatus("NOT_ISSUED")).toBe("Not issued");
  });

  it("formats activation delivery status and audit events", () => {
    expect(formatActivationDeliveryStatus("Delivered")).toBe("Delivered");
    expect(formatEventType("ActivationLinkDelivered")).toBe("Activation link delivered");
    expect(formatEventType("CredentialActivated")).toBe("Credential activated");
  });

  it("formats credential audit and activity events with compact lifecycle labels", () => {
    expect(formatCredentialAuditAction("CREDENTIAL_LIFECYCLE_ACTIVATED")).toBe("Activated");
    expect(formatCredentialAuditAction("CREDENTIAL_REACTIVATED")).toBe("Reactivated");
    expect(
      formatCredentialActivityEventStatus({
        state: "CREDENTIAL_REACTIVATED",
        status: "ACTIVE",
      }),
    ).toBe("Reactivated");
    expect(
      formatCredentialActivityEventStatus({
        state: "CREDENTIAL_LIFECYCLE_ACTIVATED",
        status: "ACTIVE",
      }),
    ).toBe("Activated");
  });
});
