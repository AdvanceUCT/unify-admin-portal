import { buildWalletActivationLink } from "@/lib/api/activationLinks";
import {
  mockActivationDeliveries,
  mockAuditEvents,
  mockBatchIssuancePreview,
  mockDashboardSummary,
  mockStudents,
} from "@/lib/api/mockData";
import type {
  ActivationDelivery,
  AdminState,
  AuditEvent,
  BatchIssuanceResult,
  DashboardSummary,
  StudentRecord,
  WalletActivationCompleteRequest,
  WalletActivationCompleteResponse,
  WalletActivationResolveRequest,
  WalletActivationResolveResponse,
} from "@/lib/api/types";

type MockActivationState = {
  activationDeliveries: ActivationDelivery[];
  auditEvents: AuditEvent[];
  students: StudentRecord[];
};

type MockResult<T> =
  | { data: T; ok: true }
  | { code: string; error: string; ok: false; status: number };

const DEMO_BATCH_TOKEN = "mock-act-7MFK2Q9V";
const DEMO_CREDENTIAL_ID = "credential-demo-002";
const DEMO_STUDENT_ID = "student-demo-002";
const DEMO_WALLET_ID = "wallet-demo-001";
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

function findDemoStudent(state: MockActivationState) {
  return state.students.find((student) => student.profile.id === DEMO_STUDENT_ID);
}

function dashboardSummary(state: MockActivationState): DashboardSummary {
  const demoCredentialIsActive =
    findDemoStudent(state)?.credential.lifecycleState === "Active";

  return {
    activeCredentials: mockDashboardSummary.activeCredentials + (demoCredentialIsActive ? 1 : 0),
    auditEventsToday: state.auditEvents.length,
    pendingIssuance: Math.max(0, mockDashboardSummary.pendingIssuance - (demoCredentialIsActive ? 1 : 0)),
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

export function queueMockBatchIssuance(now = new Date()): BatchIssuanceResult {
  const state = mutableState();
  const queuedAt = now.toISOString();
  const activationId = activationIdForToken(DEMO_BATCH_TOKEN);
  const existingIndex = state.activationDeliveries.findIndex(
    (delivery) => delivery.credentialId === DEMO_CREDENTIAL_ID,
  );
  const delivery: ActivationDelivery = {
    activationId,
    activationUrl: buildWalletActivationLink(DEMO_BATCH_TOKEN),
    batchId: mockBatchIssuancePreview.batchId,
    channel: "activation-link",
    credentialId: DEMO_CREDENTIAL_ID,
    deliveredAt: queuedAt,
    expiresAt: deliveryExpiryFrom(now),
    id: "activation-delivery-001",
    status: "Delivered",
    studentId: DEMO_STUDENT_ID,
  };

  if (existingIndex >= 0) {
    state.activationDeliveries[existingIndex] = delivery;
  } else {
    state.activationDeliveries.push(delivery);
  }

  const student = findDemoStudent(state);
  if (student) {
    student.credential.lifecycleState = "Offered";
  }

  appendAuditEvent(state, {
    actorId: "admin-demo-001",
    eventType: "ActivationLinkDelivered",
    occurredAt: queuedAt,
    reason: "Activation link delivered for simulated student credential",
    result: "Success",
    targetId: DEMO_CREDENTIAL_ID,
  });

  return {
    activationDeliveries: clone([delivery]),
    batchId: mockBatchIssuancePreview.batchId,
    cohortId: mockBatchIssuancePreview.cohortId,
    issuedCredentialIds: [DEMO_CREDENTIAL_ID],
    queuedAt,
    requestedCount: mockBatchIssuancePreview.requestedCount,
    status: "Queued",
  };
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
      walletId: DEMO_WALLET_ID,
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
    student.credential.lifecycleState = "Active";
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
