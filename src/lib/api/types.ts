export type Money = string;

export type StudentProfile = {
  email: string;
  id: string;
  firstName: string;
  lastName: string;
  institution: string;
};

export type CredentialLifecycleState =
  | "Pending"
  | "Issuing"
  | "Offered"
  | "Active"
  | "Suspended"
  | "Revoked"
  | "Expired"
  | "Renewed";

export type StudentCredential = {
  id: string;
  holderName: string;
  issuer: string;
  faculty?: string;
  programme: string;
  enrolmentStatus: "Registered" | "Suspended" | "Withdrawn" | "Graduated";
  lifecycleState: CredentialLifecycleState;
  studentNumber: string;
  validFrom: string;
  expiresAt: string;
};

export type BatchIssuanceSelection = {
  cohortId?: string;
  credentialStatus?: CredentialLifecycleState;
  enrolmentStatus?: StudentCredential["enrolmentStatus"];
  faculty?: string;
  limit?: number;
  programme?: string;
};

export type BatchIssuanceRunStatus =
  | "Draft"
  | "Previewed"
  | "Queued"
  | "Processing"
  | "Completed"
  | "PartiallyFailed"
  | "Failed"
  | "Cancelled";

export type BatchIssuanceItemStatus =
  | "Eligible"
  | "Skipped"
  | "Pending"
  | "OfferCreated"
  | "Delivered"
  | "DeliveryFailed"
  | "Activated"
  | "Failed";

export type BatchIssuancePreviewItem = {
  credentialId: string;
  email?: string;
  faculty?: string;
  holderName: string;
  programme?: string;
  reason?: string;
  status: "Eligible" | "Skipped";
  studentId: string;
};

export type BatchIssuancePreviewResult = {
  cohortId: string;
  eligibleCount: number;
  filters: BatchIssuanceSelection;
  items: BatchIssuancePreviewItem[];
  requestedCount: number;
  skippedCount: number;
};

export type BatchIssuanceRunItem = {
  activationId?: string;
  activationUrl?: string;
  activatedAt?: string;
  credentialExchangeId?: string;
  credentialId: string;
  deliveredAt?: string;
  email?: string;
  expiresAt?: string;
  faculty?: string;
  failureReason?: string;
  holderName: string;
  programme?: string;
  skipReason?: string;
  status: BatchIssuanceItemStatus;
  studentId: string;
};

export type BatchIssuanceRunSummary = {
  activatedCount: number;
  actorId?: string | null;
  batchId: string;
  cohortId: string;
  completedAt?: string;
  createdAt: string;
  eligibleCount: number;
  failedCount: number;
  filters: BatchIssuanceSelection;
  issuedCount: number;
  queuedAt?: string;
  requestedCount: number;
  skippedCount: number;
  startedAt?: string;
  status: BatchIssuanceRunStatus;
};

export type BatchIssuanceRunDetail = BatchIssuanceRunSummary & {
  items: BatchIssuanceRunItem[];
};

export type PaymentRecord = {
  id: string;
  amount: Money;
  status: "Approved" | "Pending" | "Declined";
  vendor: string;
};

export type QrPayload =
  | {
      type: "payment";
      vendorId: string;
      servicePointId: string;
      amount: Money;
      nonce: string;
    }
  | {
      type: "verification";
      vendorId: string;
      servicePointId: string;
      nonce: string;
    };

export type AuditEvent = {
  id: string;
  eventType:
    | "ActivationLinkDelivered"
    | "CredentialActivated"
    | "CredentialIssued"
    | "CredentialRenewed"
    | "CredentialSuspended"
    | "CredentialReinstated"
    | "CredentialRevoked"
    | "CredentialVerified"
    | "PaymentApproved"
    | "PaymentDeclined";
  actorId: string;
  targetId: string;
  servicePointId?: string;
  vendorId?: string;
  result: "Success" | "Failure" | "Pending";
  occurredAt: string;
  reason?: string;
};

export type ApiError = {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
};

export type StudentRecord = {
  profile: StudentProfile;
  credential: StudentCredential;
};

export type AdminVendor = {
  id: string;
  name: string;
  serviceCategory: string;
  status: "Pending" | "Approved" | "Declined";
};

export type EligibilityRule = {
  id: string;
  name: string;
  appliesTo: string;
  description: string;
};

export type DashboardSummary = {
  activeCredentials: number;
  pendingIssuance: number;
  vendorsPendingApproval: number;
  auditEventsToday: number;
};

export type ActivationDeliveryStatus = "Pending" | "Delivered" | "Failed";

export type ActivationDelivery = {
  id: string;
  activationId?: string;
  batchId: string;
  channel: "activation-link";
  credentialId: string;
  credentialExchangeId?: string;
  email?: string;
  emailStatus?: "Pending" | "Sent" | "Failed";
  studentId: string;
  activationUrl: string;
  status: ActivationDeliveryStatus;
  activatedAt?: string;
  deliveredAt?: string;
  expiresAt: string;
  failureReason?: string;
  credentialRecordId?: string;
  holderConnectionId?: string;
};

export type BatchIssuancePreview = {
  batchId: string;
  cohortId: string;
  requestedCount: number;
  status: "Queued" | "Draft";
};

export type BatchIssuanceResult = {
  batchId: string;
  cohortId: string;
  failures?: {
    email?: string;
    externalId?: string;
    message: string;
  }[];
  requestedCount: number;
  status: "Queued";
  issuedCredentialIds: string[];
  activationDeliveries: ActivationDelivery[];
  queuedAt: string;
};

export type AdminState = {
  activationDeliveries: ActivationDelivery[];
  auditEvents: AuditEvent[];
  credentials: StudentCredential[];
  dashboardSummary: DashboardSummary;
  students: StudentRecord[];
};

export type WalletActivationResolveRequest = {
  kind?: "token";
  sourceUrl?: string;
  token: string;
};

export type WalletActivationResolveResponse = {
  activationId: string;
  activationSource: "token";
  createdAt: string;
  expiresAt: string;
  invitationId: string;
  invitationUrl: string;
  issuerLabel: string;
  ledgerName: "BCovrin Test";
  studentId: string;
  walletId: string;
};

export type WalletActivationCompleteRequest = {
  activationId: string;
  credentialRecordId: string;
  holderConnectionId: string;
};

export type WalletActivationCompleteResponse = {
  activatedAt: string;
  activationId: string;
  credentialId: string;
  credentialRecordId: string;
  holderConnectionId: string;
  studentId: string;
};
