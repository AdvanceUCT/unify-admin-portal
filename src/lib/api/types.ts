export type StudentProfile = {
  email: string;
  id: string;
  firstName: string;
  lastName: string;
  institution: string;
};

export type CredentialLifecycleState =
  | "NOT_ISSUED"
  | "OFFER_SENT"
  | "ACCEPTED"
  | "ACTIVE"
  | "SUSPENDED"
  | "EXPIRED"
  | "LEGACY_NON_REVOCABLE"
  | "FAILED"
  | "REVOKED";

export type StoredCredentialLifecycleState = Exclude<CredentialLifecycleState, "NOT_ISSUED">;

export type StudentCredential = {
  id: string;
  holderName: string;
  issuer: string;
  faculty?: string;
  programme: string;
  enrolmentStatus: "Registered" | "Suspended" | "Withdrawn" | "Graduated";
  lifecycleState: CredentialLifecycleState;
  isRevocable?: boolean;
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

export type StudentRecord = {
  profile: StudentProfile;
  credential: StudentCredential;
};

export type EligibilityRule = {
  id: string;
  name: string;
  appliesTo: string;
  description: string;
};

export type DashboardSummary = {
  activeBatchJobs: number;
  failedCredentials: number;
  issuedCredentials: number;
  pendingIssuance: number;
  vendorsPendingApproval: number;
  auditEventsToday: number;
};

export type CredentialActivityEvent = {
  id: string;
  credentialExchangeId: string;
  previousState?: string;
  state: string;
  status?: StoredCredentialLifecycleState;
  studentId?: string;
  occurredAt: string;
};

export type CredentialAuditLogEntry = {
  action:
    | "OFFER_SENT"
    | "OFFER_DELIVERY_FAILED"
    | "REISSUE_REQUESTED"
    | "REVOCATION_REQUESTED"
    | "REVOCATION_COMPLETED"
    | "CREDENTIAL_LIFECYCLE_ACTIVATED"
    | "CREDENTIAL_SUSPENDED"
    | "CREDENTIAL_REACTIVATED"
    | "CREDENTIAL_REVOKED"
    | "CREDENTIAL_EXPIRED"
    | "CREDENTIAL_RENEWAL_REQUESTED";
  actorId?: string | null;
  batchId?: string | null;
  batchItemId?: string | null;
  credentialDefinitionId: string;
  credentialExchangeId?: string | null;
  credentialIssuanceId?: string | null;
  deliveryStatus?: ActivationDeliveryStatus | null;
  id: string;
  message?: string | null;
  occurredAt: string;
  studentId: string;
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
  credentialEvents?: CredentialActivityEvent[];
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
