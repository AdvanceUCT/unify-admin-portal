import { describe, expect, it } from "vitest";
import {
  formatActivationDeliveryStatus,
  formatCredentialStatus,
  formatDateTime,
  formatEventType,
} from "@/lib/formatters";

describe("formatters", () => {
  it("formats ISO timestamps", () => {
    expect(formatDateTime("2026-01-01T00:00:00Z")).toContain("2026");
  });

  it("formats credential statuses", () => {
    expect(formatCredentialStatus("ISSUED")).toBe("Issued");
    expect(formatCredentialStatus("NOT_ISSUED")).toBe("Not issued");
  });

  it("formats activation delivery status and audit events", () => {
    expect(formatActivationDeliveryStatus("Delivered")).toBe("Delivered");
    expect(formatEventType("ActivationLinkDelivered")).toBe("Activation link delivered");
    expect(formatEventType("CredentialActivated")).toBe("Credential activated");
  });
});
