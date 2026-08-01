import { buildWalletActivationLink } from "@/lib/api/activationLinks";
import {
  mockBatchIssuancePreview,
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
} from "@/lib/api/types";
import { formatCredentialStatus } from "@/lib/formatters";

type MockActivationState = {
  activationDeliveries: ActivationDelivery[];
  auditEvents: AuditEvent[];
  batchRuns: BatchIssuanceRunDetail[];
  students: StudentRecord[];
};

declare global {
  var __unifyAdminMockActivationState: MockActivationState | undefined;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createInitialState(): MockActivationState {
  return {
    activationDeliveries: [],
    auditEvents: [],
    batchRuns: [],
    students: clone(mockStudents),
  };
}

/**
 * Returns the shared mock state, initialising it on first access.
 * Stored on `globalThis` so it survives Next.js hot reloads and module
 * re-imports without resetting between requests.
 */
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

function dashboardSummary(state: MockActivationState): DashboardSummary {
  const issuedCredentials = state.students.filter((student) =>
    ["ACTIVE", "LEGACY_NON_REVOCABLE"].includes(student.credential.lifecycleState),
  ).length;
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
    vendorsPendingApproval: 0,
  };
}

/**
 * Adds an audit event to the mock state, skipping it if an identical entry
 * (same type, target, and timestamp) already exists.
 */
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
    (!selection.credentialStatus || student.credential.lifecycleState === selection.credentialStatus)
  );
}

function isEligible(student: StudentRecord) {
  return ["NOT_ISSUED", "FAILED", "REVOKED"].includes(student.credential.lifecycleState);
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

/**
 * Simulates a batch credential issuance against the mock state.
 * For each eligible student, creates an activation delivery and upserts it
 * (replaces any existing delivery for the same credential). Also updates the
 * student's lifecycle state to `OFFER_SENT` and appends an audit event.
 *
 * @param selectionInputOrNow - Filter criteria or a `Date` to override the current time.
 * @param requestedNow - Current time, used when the first arg is a selection object.
 * @returns A `BatchIssuanceResult` with the created deliveries.
 */
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

/**
 * Creates a completed mock batch run by combining a preview with a queued issuance.
 * Students not included in the delivery (skipped or failed) are added as skipped items.
 * The run is prepended to the mock state's batch run list.
 *
 * @param selectionInput - Optional filters to scope which students are included.
 * @param now - Current time used for timestamps, defaults to `new Date()`.
 * @returns The completed `BatchIssuanceRunDetail`.
 */
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

/**
 * Writes a real batch issuance result into the mock state.
 * Upserts each delivery and updates the student's lifecycle state to `OFFER_SENT`
 * for successful deliveries. Used to keep the mock store in sync when real
 * issuance runs are triggered in dev/demo mode.
 */
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
