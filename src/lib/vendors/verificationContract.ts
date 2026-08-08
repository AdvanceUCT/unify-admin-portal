import { z } from "zod";

import { VendorVerificationStatus } from "@/generated/prisma/enums";

const verificationAttributesSchema = z.record(z.string(), z.string());

const FAILURE_REASONS: Record<string, string> = {
  CREDO_PROTOCOL_ERROR: "The credential presentation could not be completed.",
  CREDENTIAL_NOT_CURRENT: "The student credential is no longer current.",
  PROOF_EXCHANGE_ABANDONED: "The student did not complete the credential presentation.",
  PROOF_NOT_VERIFIED: "The presented credential proof could not be verified.",
  PROOF_REQUEST_EXPIRED: "The verification request expired.",
  REQUIRED_ATTRIBUTE_MISSING: "The credential is missing a required attribute.",
  REVOCATION_CHECK_FAILED: "The credential revocation status could not be confirmed.",
  STUDENT_NOT_REGISTERED: "The credential does not identify a registered student.",
  UNTRUSTED_CREDENTIAL_DEFINITION: "The credential was not issued from a trusted definition.",
};

export type AgentVerificationDecision =
  | "Pending"
  | "Approved"
  | "Declined"
  | "Expired"
  | "Failed";

export type VerificationStudentSummary = {
  id: string | null;
  name: string | null;
  university: string | null;
};

const STATUS_BY_AGENT_DECISION: Record<AgentVerificationDecision, VendorVerificationStatus> = {
  Pending: VendorVerificationStatus.PENDING,
  Approved: VendorVerificationStatus.APPROVED,
  Declined: VendorVerificationStatus.DECLINED,
  Expired: VendorVerificationStatus.EXPIRED,
  Failed: VendorVerificationStatus.FAILED,
};

export function mapAgentVerificationDecision(
  decision: AgentVerificationDecision,
): VendorVerificationStatus {
  return STATUS_BY_AGENT_DECISION[decision];
}

export function parseVerificationAttributes(value: unknown): Record<string, string> {
  const result = verificationAttributesSchema.safeParse(value);
  return result.success ? result.data : {};
}

export function normalizedVerificationAttributes(value: unknown): Record<string, string> | null {
  const attributes = parseVerificationAttributes(value);
  return Object.keys(attributes).length > 0 ? attributes : null;
}

function trimmedValue(...values: Array<string | undefined>) {
  return values.map((value) => value?.trim()).find(Boolean) ?? null;
}

export function summarizeVerificationStudent(value: unknown): VerificationStudentSummary {
  const attributes = parseVerificationAttributes(value);
  const combinedName = [attributes.firstName, attributes.lastName].filter(Boolean).join(" ").trim();

  return {
    id: trimmedValue(attributes.studentNumber, attributes.studentId),
    name: trimmedValue(attributes.fullName, combinedName),
    university: trimmedValue(attributes.institution, attributes.university, attributes.universityName, attributes.issuer),
  };
}

export function vendorVerificationFailureReason(failureCode: string | null | undefined) {
  return failureCode ? FAILURE_REASONS[failureCode] ?? "Verification failed." : null;
}
