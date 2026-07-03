import { describe, expect, it } from "vitest";

import { VendorVerificationStatus } from "@/generated/prisma/enums";
import {
  mapAgentVerificationDecision,
  parseVerificationAttributes,
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
});
