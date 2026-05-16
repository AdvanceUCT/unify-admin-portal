import { buildWalletActivationLink } from "@/lib/api/activationLinks";
import {
  mockActivationDeliveries,
  mockAuditEvents,
  mockBatchIssuancePreview,
  mockDashboardSummary,
  mockStudents,
} from "@/lib/api/mockData";
import { selectStudentRecordsForCredentialIssuance } from "@/lib/student-records/simulatedUniversityRecords";
import type {
  ActivationDelivery,
  AdminState,
  AuditEvent,
  BatchIssuancePreviewItem,
  BatchIssuancePreviewResult,
  BatchIssuanceResult,
  BatchIssuanceRunDetail,
  BatchIssuanceRunItem,
  BatchIssuanceRunSummary,
  BatchIssuanceSelection,
  DashboardSummary,
  StudentRecord,
  WalletActivationCompleteRequest,
  WalletActivationCompleteResponse,
  WalletActivationResolveRequest,
  WalletActivationResolveResponse,
} from "@/lib/api/types";
import { formatCredentialStatus } from "@/lib/formatters";

type MockActivationState = {
  activationDeliveries: ActivationDelivery[];
  auditEvents: AuditEvent[];
  batchRuns: BatchIssuanceRunDetail[];
  students: StudentRecord[];
};

type MockResult<T> =
  | { data: T; ok: true }
  | { code: string; error: string; ok: false; status: number };

const DEMO_WALLET_ID_PREFIX = "wallet-demo";
const ISSUER_LABEL = "UNIFY Issuer Service";
const LEDGER_NAME = "BCovrin Test" as const;

declare global {
  var __unifyAdminMockActivationState: MockActivationState | undefined;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createInitialState(): MockActivationState {
  return {
    activationDeliveries: clone(mockActivationDeliveries),
    auditEvents: clone(mockAuditEvents),
    batchRuns: [],
    students: clone(mockStudents),
  };
}

function mutableState() {
  globalThis.__unifyAdminMockActivationState ??= createInitialState();
  return globalThis.__unifyAdminMockActivationState;
}

function suffixFor(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").slice(-8) || "demo";
}

function activationIdForToken(token: string) {
  return `activation-${suffixFor(token)}`;
}

function invitationIdForToken(token: string) {
  return `unify-oob-${suffixFor(token)}`;
}

function base64UrlEncode(value: string) {
  const utf8Value = encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_match, hex) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );

  return btoa(utf8Value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function mockInvitationUrl(invitationId: string) {
  const invitation = {
    "@id": invitationId,
    "@type": "https://didcomm.org/out-of-band/1.1/invitation",
    handshake_protocols: ["https://didcomm.org/didexchange/1.0"],
    label: ISSUER_LABEL,
    services: [
      {
        id: "#inline",
        recipientKeys: ["did:key:z6MkiTBzj1u3bdF7S7Q4TzqzH4Rb9SLGZwk9N4qe68q8nW1N"],
        routingKeys: [],
        serviceEndpoint: "https://issuer.advanceuct.test/didcomm",
        type: "did-communication",
      },
    ],
  };

  return `https://issuer.advanceuct.test/oob?oob=${base64UrlEncode(JSON.stringify(invitation))}`;
}

function tokenForDelivery(delivery: ActivationDelivery) {
  try {
    return new URL(delivery.activationUrl).searchParams.get("token") ?? "";
  } catch {
    return "";
  }
}

function activationDeliveryForToken(state: MockActivationState, token: string) {
  return state.activationDeliveries.find((delivery) => tokenForDelivery(delivery) === token);
}

function activationDeliveryForActivationId(state: MockActivationState, activationId: string) {
  return state.activationDeliveries.find((delivery) => {
    const token = tokenForDelivery(delivery);
    return delivery.activationId === activationId || (token ? activationIdForToken(token) === activationId : false);
  });
}

function dashboardSummary(state: MockActivationState): DashboardSummary {
  const issuedCredentials = state.students.filter((student) => student.credential.lifecycleState === "ISSUED").length;
  const failedCredentials = state.students.filter((student) => student.credential.lifecycleState === "FAILED").length;
  const pendingIssuance = state.students.filter((student) =>
    ["OFFER_SENT", "ACCEPTED"].includes(student.credential.lifecycleState),
  ).length;

  return {
    activeBatchJobs: state.batchRuns.filter((run) => run.status === "Queued" || run.status === "Processing").length,
    auditEventsToday: state.auditEvents.length,
    failedCredentials,
    issuedCredentials,
    pendingIssuance,
    vendorsPendingApproval: mockDashboardSummary.vendorsPendingApproval,
  };
}

function appendAuditEvent(state: MockActivationState, event: Omit<AuditEvent, "id">) {
  const duplicate = state.auditEvents.some(
    (candidate) =>
      candidate.eventType === event.eventType &&
      candidate.targetId === event.targetId &&
      candidate.occurredAt === event.occurredAt,
  );

  if (duplicate) {
    return;
  }

  state.auditEvents.unshift({
    ...event,
    id: `audit-${String(state.auditEvents.length + 1).padStart(3, "0")}`,
  });
}

function deliveryExpiryFrom(now: Date) {
  const expiresAt = new Date(now);
  expiresAt.setHours(expiresAt.getHours() + 24);
  return expiresAt.toISOString();
}

function batchIdFrom(now: Date) {
  const timestamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `batch-${timestamp}`;
}

function normalizeMockSelection(selection: BatchIssuanceSelection = {}): BatchIssuanceSelection {
  return {
    cohortId: selection.cohortId || mockBatchIssuancePreview.cohortId,
    credentialStatus: selection.credentialStatus || undefined,
    enrolmentStatus: selection.enrolmentStatus || undefined,
    faculty: selection.faculty || undefined,
    limit:
      typeof selection.limit === "number" && Number.isInteger(selection.limit) && selection.limit > 0
        ? selection.limit
        : undefined,
    programme: selection.programme || undefined,
  };
}

function fullName(student: StudentRecord) {
  return `${student.profile.firstName} ${student.profile.lastName}`;
}

function matchesSelection(student: StudentRecord, selection: BatchIssuanceSelection) {
  return (
    (!selection.faculty || student.credential.faculty === selection.faculty) &&
    (!selection.programme || student.credential.programme === selection.programme) &&
    (!selection.enrolmentStatus || student.credential.enrolmentStatus === selection.enrolmentStatus) &&
    (!selection.credentialStatus || student.credential.lifecycleState === selection.credentialStatus)
  );
}

function isEligible(student: StudentRecord) {
  return (
    ["NOT_ISSUED", "FAILED", "REVOKED"].includes(student.credential.lifecycleState) &&
    student.credential.enrolmentStatus === "Registered"
  );
}

function mockPreviewItem(student: StudentRecord, status: "Eligible" | "Skipped"): BatchIssuancePreviewItem {
  const reason = status === "Skipped" ? `Credential status is ${formatCredentialStatus(student.credential.lifecycleState)}.` : undefined;
  return {
    credentialId: student.credential.id,
    email: student.profile.email,
    faculty: student.credential.faculty,
    holderName: fullName(student),
    programme: student.credential.programme,
    reason,
    status,
    studentId: student.profile.id,
  };
}

function deliveryToRunItem(delivery: ActivationDelivery, student: StudentRecord): BatchIssuanceRunItem {
  return {
    activationId: delivery.activationId,
    activationUrl: delivery.activationUrl,
    activatedAt: delivery.activatedAt,
    credentialExchangeId: delivery.credentialExchangeId,
    credentialId: delivery.credentialId,
    deliveredAt: delivery.deliveredAt,
    email: delivery.email ?? student.profile.email,
    expiresAt: delivery.expiresAt,
    faculty: student.credential.faculty,
    failureReason: delivery.failureReason,
    holderName: fullName(student),
    programme: student.credential.programme,
    status: delivery.status === "Delivered" ? "Delivered" : "DeliveryFailed",
    studentId: delivery.studentId,
  };
}

export function getMockAdminState(): AdminState {
  const state = mutableState();
  const students = clone(state.students);

  return {
    activationDeliveries: clone(state.activationDeliveries),
    auditEvents: clone(state.auditEvents),
    credentials: students.map((student) => student.credential),
    dashboardSummary: dashboardSummary(state),
    students,
  };
}

export function resetMockActivationStore() {
  globalThis.__unifyAdminMockActivationState = createInitialState();
  return getMockAdminState();
}

export function queueMockBatchIssuance(
  selectionInputOrNow: BatchIssuanceSelection | Date = {},
  requestedNow = new Date(),
): BatchIssuanceResult {
  const state = mutableState();
  const now = selectionInputOrNow instanceof Date ? selectionInputOrNow : requestedNow;
  const queuedAt = now.toISOString();
  const selectionInput = selectionInputOrNow instanceof Date ? {} : selectionInputOrNow;
  const selection = normalizeMockSelection(selectionInput);
  const batchId = batchIdFrom(now);
  const studentsForIssuance = selectStudentRecordsForCredentialIssuance(state.students, {
    ...selection,
    limit: selection.limit ?? mockBatchIssuancePreview.requestedCount,
  });
  const activationDeliveries = studentsForIssuance.map((student, index): ActivationDelivery => {
    const token = `mock-act-${batchId}-${String(index + 1).padStart(3, "0")}`;

    return {
      activationId: activationIdForToken(token),
      activationUrl: buildWalletActivationLink(token),
      batchId,
      channel: "activation-link",
      credentialId: student.credential.id,
      deliveredAt: queuedAt,
      expiresAt: deliveryExpiryFrom(now),
      id: `activation-delivery-${String(index + 1).padStart(3, "0")}`,
      status: "Delivered",
      studentId: student.profile.id,
    };
  });

  for (const delivery of activationDeliveries) {
    const existingIndex = state.activationDeliveries.findIndex(
      (candidate) => candidate.credentialId === delivery.credentialId,
    );

    if (existingIndex >= 0) {
      state.activationDeliveries[existingIndex] = delivery;
    } else {
      state.activationDeliveries.push(delivery);
    }

    const student = state.students.find((candidate) => candidate.profile.id === delivery.studentId);
    if (student) {
      student.credential.lifecycleState = "OFFER_SENT";
    }

    appendAuditEvent(state, {
      actorId: "admin-demo-001",
      eventType: "ActivationLinkDelivered",
      occurredAt: queuedAt,
      reason: "Activation link delivered for simulated student credential",
      result: "Success",
      targetId: delivery.credentialId,
    });
  }

  return {
    activationDeliveries: clone(activationDeliveries),
    batchId,
    cohortId: selection.cohortId ?? mockBatchIssuancePreview.cohortId,
    issuedCredentialIds: activationDeliveries.map((delivery) => delivery.credentialId),
    queuedAt,
    requestedCount: studentsForIssuance.length,
    status: "Queued",
  };
}

export function previewMockBatchIssuance(selectionInput: BatchIssuanceSelection = {}): BatchIssuancePreviewResult {
  const state = mutableState();
  const selection = normalizeMockSelection(selectionInput);
  const matchingStudents = state.students.filter((student) => matchesSelection(student, selection));
  const limitedStudents = selection.limit ? matchingStudents.slice(0, selection.limit) : matchingStudents;
  const items = limitedStudents.map((student) => mockPreviewItem(student, isEligible(student) ? "Eligible" : "Skipped"));

  return {
    cohortId: selection.cohortId ?? mockBatchIssuancePreview.cohortId,
    eligibleCount: items.filter((item) => item.status === "Eligible").length,
    filters: selection,
    items,
    requestedCount: items.length,
    skippedCount: items.filter((item) => item.status === "Skipped").length,
  };
}

export function createMockBatchRun(selectionInput: BatchIssuanceSelection = {}, now = new Date()): BatchIssuanceRunDetail {
  const state = mutableState();
  const selection = normalizeMockSelection(selectionInput);
  const preview = previewMockBatchIssuance(selection);
  const result = queueMockBatchIssuance(selection, now);
  const deliveredItems = result.activationDeliveries.map((delivery) => {
    const student = state.students.find((candidate) => candidate.profile.id === delivery.studentId);
    return student ? deliveryToRunItem(delivery, student) : undefined;
  }).filter((item): item is BatchIssuanceRunItem => Boolean(item));
  const deliveredStudentIds = new Set(deliveredItems.map((item) => item.studentId));
  const skippedItems: BatchIssuanceRunItem[] = preview.items
    .filter((item) => item.status === "Skipped" || !deliveredStudentIds.has(item.studentId))
    .map((item) => ({
      credentialId: item.credentialId,
      email: item.email,
      faculty: item.faculty,
      holderName: item.holderName,
      programme: item.programme,
      skipReason: item.reason,
      status: item.status === "Skipped" ? "Skipped" : "Failed",
      studentId: item.studentId,
    }));
  const failedCount = skippedItems.filter((item) => item.status !== "Skipped").length;
  const run: BatchIssuanceRunDetail = {
    activatedCount: 0,
    actorId: "admin-demo-001",
    batchId: result.batchId,
    cohortId: result.cohortId,
    completedAt: now.toISOString(),
    createdAt: now.toISOString(),
    eligibleCount: preview.eligibleCount,
    failedCount,
    filters: selection,
    issuedCount: deliveredItems.length,
    items: [...deliveredItems, ...skippedItems],
    queuedAt: result.queuedAt,
    requestedCount: preview.requestedCount,
    skippedCount: preview.skippedCount,
    startedAt: result.queuedAt,
    status: failedCount > 0 ? "PartiallyFailed" : "Completed",
  };

  state.batchRuns.unshift(run);
  return clone(run);
}

export function listMockBatchRuns(): BatchIssuanceRunSummary[] {
  return clone(
    mutableState().batchRuns.map((run) => ({
      activatedCount: run.activatedCount,
      actorId: run.actorId,
      batchId: run.batchId,
      cohortId: run.cohortId,
      completedAt: run.completedAt,
      createdAt: run.createdAt,
      eligibleCount: run.eligibleCount,
      failedCount: run.failedCount,
      filters: run.filters,
      issuedCount: run.issuedCount,
      queuedAt: run.queuedAt,
      requestedCount: run.requestedCount,
      skippedCount: run.skippedCount,
      startedAt: run.startedAt,
      status: run.status,
    })),
  );
}

export function getMockBatchRunDetail(batchId: string): BatchIssuanceRunDetail | undefined {
  const run = mutableState().batchRuns.find((candidate) => candidate.batchId === batchId);
  return run ? clone(run) : undefined;
}

export function retryMockBatchRun(batchId: string): BatchIssuanceRunDetail {
  const existing = getMockBatchRunDetail(batchId);
  if (!existing) {
    throw new Error("Batch issuance run was not found.");
  }

  return createMockBatchRun(existing.filters);
}

export function recordBatchIssuanceResult(result: BatchIssuanceResult, now = new Date()) {
  const state = mutableState();
  const recordedAt = now.toISOString();

  for (const delivery of result.activationDeliveries) {
    const existingIndex = state.activationDeliveries.findIndex(
      (candidate) => candidate.credentialId === delivery.credentialId,
    );

    if (existingIndex >= 0) {
      state.activationDeliveries[existingIndex] = clone(delivery);
    } else {
      state.activationDeliveries.push(clone(delivery));
    }

    const student = state.students.find((candidate) => candidate.profile.id === delivery.studentId);
    if (student && delivery.status === "Delivered") {
      student.credential.lifecycleState = "OFFER_SENT";
    }

    appendAuditEvent(state, {
      actorId: "admin-demo-001",
      eventType: "ActivationLinkDelivered",
      occurredAt: delivery.deliveredAt ?? recordedAt,
      reason:
        delivery.status === "Delivered"
          ? "Activation link delivered through the Identity Agent Service"
          : (delivery.failureReason ?? "Activation link delivery failed"),
      result: delivery.status === "Delivered" ? "Success" : "Failure",
      targetId: delivery.credentialId,
    });
  }

  return getMockAdminState();
}

export function resolveMockWalletActivation(
  request: WalletActivationResolveRequest,
  now = new Date(),
): MockResult<WalletActivationResolveResponse> {
  const token = request.token?.trim();

  if (!token) {
    return {
      code: "ActivationTokenRequired",
      error: "Activation token is required.",
      ok: false,
      status: 400,
    };
  }

  const state = mutableState();
  const delivery = activationDeliveryForToken(state, token);

  if (!delivery) {
    return {
      code: "ActivationTokenNotFound",
      error: "Activation token was not found.",
      ok: false,
      status: 404,
    };
  }

  if (new Date(delivery.expiresAt).getTime() <= now.getTime()) {
    return {
      code: "ActivationTokenExpired",
      error: "Activation token has expired.",
      ok: false,
      status: 410,
    };
  }

  if (delivery.status !== "Delivered") {
    return {
      code: "ActivationDeliveryNotReady",
      error: "Activation delivery is not ready for wallet activation.",
      ok: false,
      status: 409,
    };
  }

  const activationId = delivery.activationId ?? activationIdForToken(token);
  const invitationId = invitationIdForToken(token);
  delivery.activationId = activationId;

  return {
    data: {
      activationId,
      activationSource: "token",
      createdAt: delivery.deliveredAt ?? now.toISOString(),
      expiresAt: delivery.expiresAt,
      invitationId,
      invitationUrl: mockInvitationUrl(invitationId),
      issuerLabel: ISSUER_LABEL,
      ledgerName: LEDGER_NAME,
      studentId: delivery.studentId,
      walletId: `${DEMO_WALLET_ID_PREFIX}-${suffixFor(delivery.studentId)}`,
    },
    ok: true,
  };
}

export function completeMockWalletActivation(
  request: WalletActivationCompleteRequest,
  now = new Date(),
): MockResult<WalletActivationCompleteResponse> {
  const activationId = request.activationId?.trim();
  const holderConnectionId = request.holderConnectionId?.trim();
  const credentialRecordId = request.credentialRecordId?.trim();

  if (!activationId || !holderConnectionId || !credentialRecordId) {
    return {
      code: "ActivationCompletionRequired",
      error: "Activation id, holder connection id, and credential record id are required.",
      ok: false,
      status: 400,
    };
  }

  const state = mutableState();
  const delivery = activationDeliveryForActivationId(state, activationId);

  if (!delivery) {
    return {
      code: "ActivationNotFound",
      error: "Activation was not found.",
      ok: false,
      status: 404,
    };
  }

  const activatedAt = now.toISOString();
  const student = state.students.find((candidate) => candidate.profile.id === delivery.studentId);

  if (student) {
    student.credential.lifecycleState = "ISSUED";
  }

  delivery.activatedAt = activatedAt;
  delivery.activationId = activationId;
  delivery.credentialRecordId = credentialRecordId;
  delivery.holderConnectionId = holderConnectionId;

  appendAuditEvent(state, {
    actorId: "wallet-demo-001",
    eventType: "CredentialActivated",
    occurredAt: activatedAt,
    reason: "Student wallet completed simulated holder activation",
    result: "Success",
    targetId: delivery.credentialId,
  });

  return {
    data: {
      activatedAt,
      activationId,
      credentialId: delivery.credentialId,
      credentialRecordId,
      holderConnectionId,
      studentId: delivery.studentId,
    },
    ok: true,
  };
}
