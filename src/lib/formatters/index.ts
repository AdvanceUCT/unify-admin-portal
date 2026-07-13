import type {
  ActivationDeliveryStatus,
  AuditEvent,
  CredentialLifecycleState,
  CredentialAuditLogEntry,
} from "@/lib/api/types";

const dateTimeFormatter = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const credentialStatusLabels: Record<CredentialLifecycleState, string> = {
  ACCEPTED: "Accepted",
  ACTIVE: "Active",
  EXPIRED: "Expired",
  FAILED: "Failed",
  LEGACY_NON_REVOCABLE: "Legacy non-revocable",
  NOT_ISSUED: "Not issued",
  OFFER_SENT: "Offer sent",
  REVOKED: "Revoked",
  SUSPENDED: "Suspended",
};

const activationDeliveryStatusLabels: Record<ActivationDeliveryStatus, string> = {
  Delivered: "Delivered",
  Failed: "Failed",
  Pending: "Pending",
};

const credentialAuditActionLabels: Record<CredentialAuditLogEntry["action"], string> = {
  CREDENTIAL_EXPIRED: "Credential expired",
  CREDENTIAL_LIFECYCLE_ACTIVATED: "Credential activated",
  CREDENTIAL_REACTIVATED: "Credential reactivated",
  CREDENTIAL_RENEWAL_REQUESTED: "Renewal requested",
  CREDENTIAL_REVOKED: "Credential revoked",
  CREDENTIAL_SUSPENDED: "Credential suspended",
  OFFER_DELIVERY_FAILED: "Offer delivery failed",
  OFFER_SENT: "Offer sent",
  REISSUE_REQUESTED: "Reissue requested",
  REVOCATION_COMPLETED: "Revocation completed",
  REVOCATION_REQUESTED: "Revocation requested",
};

const eventTypeLabels: Record<AuditEvent["eventType"], string> = {
  ActivationLinkDelivered: "Activation link delivered",
  CredentialActivated: "Credential activated",
  CredentialIssued: "Credential issued",
  CredentialRenewed: "Credential renewed",
  CredentialSuspended: "Credential suspended",
  CredentialReinstated: "Credential reinstated",
  CredentialRevoked: "Credential revoked",
  CredentialVerified: "Credential verified",
  PaymentApproved: "Payment approved",
  PaymentDeclined: "Payment declined",
};

export function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

export function formatCredentialStatus(value: CredentialLifecycleState) {
  return credentialStatusLabels[value];
}

export function credentialStatusTone(value: CredentialLifecycleState) {
  if (value === "ACTIVE") return "success";
  if (value === "FAILED" || value === "REVOKED" || value === "EXPIRED") return "danger";
  if (value === "OFFER_SENT" || value === "ACCEPTED" || value === "SUSPENDED") return "warning";
  return "neutral";
}

export function formatActivationDeliveryStatus(value: ActivationDeliveryStatus) {
  return activationDeliveryStatusLabels[value];
}

export function formatCredentialAuditAction(value: CredentialAuditLogEntry["action"]) {
  return credentialAuditActionLabels[value];
}

export function formatEventType(value: AuditEvent["eventType"]) {
  return eventTypeLabels[value];
}
