import { createRoot } from "react-dom/client";
import { PaymentAccessFixture } from "./payment-access";
import { IntegrationRouteShell } from "../../src/features/vendors/integrations/IntegrationRouteShell";
import { IntegrationWorkflow } from "../../src/features/vendors/integrations/IntegrationWorkflow";
import { IntegrationKeysContent } from "../../src/features/vendors/integrations/ApiKeySettings";
import { LegacyIntegrationRedirect } from "../../src/features/vendors/integrations/LegacyIntegrationRedirect";
import { legacyIntegrationDestination } from "../../src/lib/vendors/integrationNavigation";
import Loading from "../../src/app/vendor/(portal)/integrations/loading";
import ErrorBoundary from "../../src/app/vendor/(portal)/integrations/error";
const url = new URL(window.location.href);
const screen = url.searchParams.get("screen") ?? "";
const branches = [{ id: "synthetic-campus-branch", name: "Campus café", active: true, status: "ACTIVE", paymentStatus: "ACTIVE", isDefault: true }, { id: "synthetic-library-branch", name: "Library counter", active: false, status: "DISABLED", paymentStatus: "CLOSED", isDefault: false }];
const state = { branches, verification: { ready: true, key: true, callback: true, lastSuccess: null }, payments: { ready: true, key: true, callback: true, lastSuccess: null, reason: null } };
let configuration: { url: string; enabled: boolean; branchIds: string[] } | null = url.searchParams.has("empty") ? null : { url: "https://synthetic-receiver.example/events", enabled: !url.searchParams.has("disabled"), branchIds: [branches[0].id] };
const histories = {
 verification: { items: [{ id: "synthetic-attempt", verificationId: "synthetic-verification", verificationRequestId: "synthetic-request", checkoutId: "checkout-001", verificationStatus: "APPROVED", attemptNumber: 1, status: "FAILED", httpStatus: 500, attemptedAt: "2026-10-17T10:00:00Z", failureReason: "Receiver did not accept the webhook." }], nextCursor: null, lastSuccess: null },
 payments: { items: [{ id: "synthetic-event", eventType: "payment_request.paid", requestId: "synthetic-sale", createdAt: "2026-10-17T10:00:00Z", delivery: { status: "READY", nextAttemptAt: "2026-10-17T10:05:00Z", attempts: [{ sequence: 1, outcome: "FAILED", httpStatus: 500, errorCode: "HTTP_REJECTED", startedAt: "2026-10-17T10:00:00Z" }] } }], nextCursor: null, lastSuccess: null, oldestOutstanding: null }
};
const keys = [{ id: "synthetic-key", name: "Campus till", keyPrefix: "a1b2c3d4e5f6", createdAt: "2026-10-17T10:00:00Z", lastUsedAt: null, revokedAt: null, scopes: ["payments:create", "payments:read", "payments:cancel"], branchIds: [branches[0].id] }];
window.fetch = async (request, options) => {
 const path = String(request); const kind = path.includes("payment-webhook") ? "payments" : "verification";
 if (path.includes("api-keys")) { if (options?.method === "POST") return Response.json({ id: "synthetic-new-key", ...JSON.parse(options.body as string), prefix: "synthetic", token: "unify_vk_synthetic_once", createdAt: "2026-10-17T10:00:00Z" }); return Response.json(options?.method === "DELETE" ? { revoked: true } : keys); }
 if (path.includes("history")) return url.searchParams.has("history-error") ? Response.json({}, { status: 503 }) : Response.json(url.searchParams.has("empty") ? { items: [], nextCursor: null, lastSuccess: null } : histories[kind]);
 if (url.searchParams.has("config-error")) return Response.json({}, { status: 503 });
 if (options?.method === "PUT") { configuration = { ...JSON.parse(options.body as string), enabled: true }; return Response.json({ configuration, secret: "synthetic-payment-once", signingSecret: "synthetic-verification-once" }); }
 if (options?.method === "DELETE") { if (configuration) configuration.enabled = false; return Response.json({ disabled: true }); }
 return Response.json(options?.method === "POST" ? { queued: true } : configuration);
};
const kind = url.pathname.endsWith("/payments") ? "payments" : "verification";
const isAccess = screen.startsWith("access-");
const content = isAccess ? <PaymentAccessFixture screen={screen} /> : legacyIntegrationDestination(url.pathname, url.search, url.hash) ? <LegacyIntegrationRedirect /> : screen === "loading" ? <Loading /> : screen === "error" ? <ErrorBoundary reset={() => window.location.reload()} /> : url.pathname.endsWith("/keys") ? <IntegrationKeysContent branches={branches} initialApiKeys={keys} preset={url.searchParams.get("preset") === "payments" ? "payments" : "verification"} returnTo={url.searchParams.get("returnTo") === "payments" ? "payments" : "verification"} /> : <IntegrationWorkflow kind={kind} baseUrl="https://synthetic-portal.example" state={state} />;
createRoot(document.getElementById("root")!).render(<div data-portal={screen.startsWith("access-admin") ? "admin" : "vendor"} className="min-h-screen bg-bg text-fg"><div className="sticky top-0 z-30 flex h-16 items-center border-b border-border bg-surface px-5"><span className="text-lg font-semibold text-brand-700">UNIFY</span><span className="ml-4 text-sm text-fg-muted">Synthetic review</span></div><main className="mx-auto max-w-6xl px-4 py-6 sm:px-8">{isAccess ? content : <IntegrationRouteShell>{content}</IntegrationRouteShell>}</main></div>);
