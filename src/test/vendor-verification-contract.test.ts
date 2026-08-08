import { describe, expect, it } from "vitest";

import { VendorVerificationStatus } from "@/generated/prisma/enums";
import {
  mapAgentVerificationDecision,
  normalizedVerificationAttributes,
  parseVerificationAttributes,
  summarizeVerificationStudent,
  vendorVerificationFailureReason,
} from "@/lib/vendors/verificationContract";

describe("vendor verification contract", () => {
  it.each([
    ["Pending", VendorVerificationStatus.PENDING],
    ["Approved", VendorVerificationStatus.APPROVED],
    ["Declined", VendorVerificationStatus.DECLINED],
    ["Expired", VendorVerificationStatus.EXPIRED],
    ["Failed", VendorVerificationStatus.FAILED],
  ] as const)("maps the agent decision %s explicitly", (decision, expected) => {
    expect(mapAgentVerificationDecision(decision)).toBe(expected);
  });

  it("keeps every string attribute returned by the verifier", () => {
    expect(
      parseVerificationAttributes({
        studentNumber: "VSKCAL001",
        firstName: "Caleb",
        programme: "Computer Science",
        year: "3",
      }),
    ).toEqual({
      studentNumber: "VSKCAL001",
      firstName: "Caleb",
      programme: "Computer Science",
      year: "3",
    });
  });

  it.each([null, [], { year: 3 }, { active: true }])(
    "rejects malformed attribute payloads: %j",
    (value) => {
      expect(parseVerificationAttributes(value)).toEqual({});
    },
  );

  it("returns null when no usable attributes are present", () => {
    expect(normalizedVerificationAttributes(null)).toBeNull();
    expect(normalizedVerificationAttributes({})).toBeNull();
  });

  it("derives a vendor-facing student summary from verified attributes", () => {
    expect(
      summarizeVerificationStudent({
        firstName: "Ada",
        institution: "University of Cape Town",
        lastName: "Lovelace",
        studentNumber: "STU001",
      }),
    ).toEqual({
      id: "STU001",
      name: "Ada Lovelace",
      university: "University of Cape Town",
    });
  });

  it("falls back across supported student summary attribute names", () => {
    expect(
      summarizeVerificationStudent({
        fullName: "Grace Hopper",
        issuer: "UCT",
        studentId: "STU002",
      }),
    ).toEqual({
      id: "STU002",
      name: "Grace Hopper",
      university: "UCT",
    });
  });

  it("maps known failure codes to vendor-readable reasons", () => {
    expect(vendorVerificationFailureReason("PROOF_NOT_VERIFIED")).toBe(
      "The presented credential proof could not be verified.",
    );
    expect(vendorVerificationFailureReason("UNKNOWN_CODE")).toBe("Verification failed.");
    expect(vendorVerificationFailureReason(null)).toBeNull();
  });
});
