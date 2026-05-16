import type {
  ActivationDeliveryStatus,
  AuditEvent,
  CredentialLifecycleState,
  Money,
  PaymentRecord,
} from "@/lib/api/types";

const currencyFormatter = new Intl.NumberFormat("en-ZA", {
  currency: "ZAR",
  style: "currency",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const credentialStatusLabels: Record<CredentialLifecycleState, string> = {
  ACCEPTED: "Accepted",
  FAILED: "Failed",
  ISSUED: "Issued",
  NOT_ISSUED: "Not issued",
  OFFER_SENT: "Offer sent",
  REVOKED: "Revoked",
};

const activationDeliveryStatusLabels: Record<ActivationDeliveryStatus, string> = {
  Delivered: "Delivered",
  Failed: "Failed",
  Pending: "Pending",
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

const paymentStatusLabels: Record<PaymentRecord["status"], string> = {
  Approved: "Approved",
  Declined: "Declined",
  Pending: "Pending",
};

export function formatMoney(value: Money) {
  return currencyFormatter.format(Number(value));
}

export function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

export function formatCredentialStatus(value: CredentialLifecycleState) {
  return credentialStatusLabels[value];
}

export function credentialStatusTone(value: CredentialLifecycleState) {
  if (value === "ISSUED") return "success";
  if (value === "FAILED" || value === "REVOKED") return "danger";
  if (value === "OFFER_SENT" || value === "ACCEPTED") return "warning";
  return "neutral";
}

export function formatActivationDeliveryStatus(value: ActivationDeliveryStatus) {
  return activationDeliveryStatusLabels[value];
}

export function formatEventType(value: AuditEvent["eventType"]) {
  return eventTypeLabels[value];
}

export function formatPaymentStatus(value: PaymentRecord["status"]) {
  return paymentStatusLabels[value];
}
