import { z } from "zod";

import { VendorVerificationStatus } from "@/generated/prisma/enums";

const verificationAttributesSchema = z.record(z.string(), z.string());

export type AgentVerificationDecision =
  | "Pending"
  | "Approved"
  | "Declined"
  | "Expired"
  | "Failed";

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
