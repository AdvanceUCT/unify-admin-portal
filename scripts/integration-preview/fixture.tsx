import { createRoot } from "react-dom/client";
import { IntegrationNav } from "../../src/features/vendors/integrations/IntegrationNav";
import { IntegrationOverview } from "../../src/features/vendors/integrations/IntegrationOverview";
import { IntegrationDocs } from "../../src/features/vendors/integrations/IntegrationDocs";
import { VendorIntegrationSettings } from "../../src/features/vendors/VendorIntegrationSettings";
import { CallbackSettings } from "../../src/features/vendors/integrations/CallbackSettings";
import GuidesPage from "../../src/app/vendor/(portal)/integrations/guides/page";
import Loading from "../../src/app/vendor/(portal)/integrations/loading";
import ErrorBoundary from "../../src/app/vendor/(portal)/integrations/error";

// Synthetic visual fixtures reuse production components, never real API keys or network endpoints.
const branches = [{ id: "synthetic-campus-branch", name: "Campus café", active: true, status: "ACTIVE", paymentStatus: "ACTIVE", isDefault: true }, { id: "synthetic-library-branch", name: "Library counter", active: false, status: "DISABLED", paymentStatus: "DISABLED", isDefault: false }];
const url = new URL(window.location.href);
const screen = url.searchParams.get("screen") ?? (url.pathname.split("/").at(-1) === "integrations" ? "overview" : url.pathname.split("/").at(-1)) ?? "overview";
const overview = { branches, verification: { ready: true, key: true, callback: true, lastSuccess: null }, payments: { ready: true, key: true, callback: false, lastSuccess: null, reason: null } };
const config = { url: "https://synthetic-receiver.example/events", enabled: true, branchIds: [branches[0].id] };
const histories = {
  verification: { items: [{ id: "synthetic-attempt", verificationId: "synthetic-verification", verificationRequestId: "synthetic-request", checkoutId: "checkout-001", verificationStatus: "APPROVED", attemptNumber: 1, status: "FAILED", httpStatus: 500, attemptedAt: "2026-10-07T10:00:00Z", failureReason: "Receiver did not accept the callback." }], nextCursor: null, lastSuccess: null },
  payments: { items: [{ id: "synthetic-event", eventType: "payment_request.paid", requestId: "synthetic-sale", createdAt: "2026-10-07T10:00:00Z", delivery: { status: "READY", nextAttemptAt: "2026-10-07T10:05:00Z", attempts: [{ sequence: 1, outcome: "FAILED", httpStatus: 500, errorCode: "HTTP_REJECTED", startedAt: "2026-10-07T10:00:00Z" }] } }], nextCursor: null, lastSuccess: null, oldestOutstanding: "2026-10-07T10:00:00Z" },
};
window.fetch = async request => {
  const path = String(request);
  const kind = path.includes("payment-webhook") ? "payments" : "verification";
  return new Response(JSON.stringify(path.includes("history") ? histories[kind] : config), { status: 200, headers: { "Content-Type": "application/json" } });
};
const content = screen === "overview" ? <IntegrationOverview state={overview} /> : screen === "keys" ? <VendorIntegrationSettings branches={branches} initialApiKeys={[{ id: "synthetic-key", name: "Campus till", keyPrefix: "a1b2c3d4e5f6", createdAt: "2026-10-07T10:00:00Z", lastUsedAt: null, revokedAt: null, scopes: ["payments:create", "payments:read", "payments:cancel"], branchIds: [branches[0].id] }]} initialPreset="payments" /> : screen === "callbacks" ? <CallbackSettings kind={url.searchParams.get("type") === "payments" ? "payments" : "verification"} branches={branches} /> : screen === "guides" ? <GuidesPage /> : screen === "loading" ? <Loading /> : screen === "error" ? <ErrorBoundary reset={() => window.location.reload()} /> : <IntegrationDocs baseUrl="https://synthetic-portal.example" branches={branches} guide={screen === "verification" || screen === "payments" || screen === "refunds" ? screen : undefined} />;
createRoot(document.getElementById("root")!).render(<div data-portal="vendor" className="min-h-screen bg-bg text-fg"><div className="border-b border-border bg-surface px-5 py-4"><span className="text-lg font-semibold text-brand-700">UNIFY</span><span className="ml-4 text-sm text-fg-muted">Vendor portal · Synthetic preview</span></div><main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8"><header><h1 className="text-page-title">Integrations</h1><p className="mt-1 text-sm text-fg-muted">Connect your website or till to UNIFY.</p></header><IntegrationNav />{content}</main></div>);
