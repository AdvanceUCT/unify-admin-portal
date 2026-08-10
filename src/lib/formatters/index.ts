/**
 * @fileoverview Formats dates, identifiers, names, and status values for portal screens.
 * @module lib/formatters/index
 */

import type {
  ActivationDeliveryStatus,
  AuditEvent,
  CredentialActivityEvent,
  CredentialLifecycleState,
  CredentialAuditLogEntry,
  StoredCredentialLifecycleState,
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
  CREDENTIAL_EXPIRED: "Expired",
  CREDENTIAL_LIFECYCLE_ACTIVATED: "Activated",
  CREDENTIAL_RENEWAL_FAILED: "Renewal failed",
  CREDENTIAL_RENEWAL_OFFER_CREATED: "Renewal offer created",
  CREDENTIAL_REACTIVATED: "Reactivated",
  CREDENTIAL_RENEWAL_REQUESTED: "Renewal requested",
  CREDENTIAL_REVOKED: "Revoked",
  CREDENTIAL_SUSPENDED: "Suspended",
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

export function credentialAuditActionTone(value: CredentialAuditLogEntry["action"]) {
  if (
    value === "CREDENTIAL_LIFECYCLE_ACTIVATED" ||
    value === "CREDENTIAL_REACTIVATED"
  ) {
    return "success";
  }
  if (
    value === "CREDENTIAL_EXPIRED" ||
    value === "CREDENTIAL_RENEWAL_FAILED" ||
    value === "CREDENTIAL_REVOKED" ||
    value === "OFFER_DELIVERY_FAILED" ||
    value === "REVOCATION_COMPLETED"
  ) {
    return "danger";
  }
  if (
    value === "CREDENTIAL_RENEWAL_OFFER_CREATED" ||
    value === "CREDENTIAL_RENEWAL_REQUESTED" ||
    value === "CREDENTIAL_SUSPENDED" ||
    value === "OFFER_SENT" ||
    value === "REISSUE_REQUESTED" ||
    value === "REVOCATION_REQUESTED"
  ) {
    return "warning";
  }
  return "neutral";
}

export function credentialStatusForAuditAction(
  value: CredentialAuditLogEntry["action"],
): StoredCredentialLifecycleState | undefined {
  if (value === "OFFER_SENT") return "OFFER_SENT";
  if (value === "CREDENTIAL_LIFECYCLE_ACTIVATED" || value === "CREDENTIAL_REACTIVATED") return "ACTIVE";
  if (value === "CREDENTIAL_SUSPENDED") return "SUSPENDED";
  if (value === "CREDENTIAL_REVOKED") return "REVOKED";
  return undefined;
}

export function formatActivationDeliveryStatus(value: ActivationDeliveryStatus) {
  return activationDeliveryStatusLabels[value];
}

export function formatCredentialAuditAction(value: CredentialAuditLogEntry["action"]) {
  return credentialAuditActionLabels[value];
}

export function formatCredentialActivityEventStatus(event: Pick<CredentialActivityEvent, "state" | "status">) {
  if (event.state in credentialAuditActionLabels) {
    return credentialAuditActionLabels[event.state as CredentialAuditLogEntry["action"]];
  }
  return event.status ? formatCredentialStatus(event.status) : "";
}

export function formatEventType(value: AuditEvent["eventType"]) {
  return eventTypeLabels[value];
}
