import { formatSastDateTime, sastIsoTimestamp, sastInputToUtc, sastDateKey } from "../../src/lib/formatters/time";
import { WelcomePage } from "../../src/features/welcome/WelcomePage";
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
const branches = [{ id: "synthetic-campus-branch", name: "Campus café", active: true, status: "ACTIVE" as const, paymentStatus: "ACTIVE" as const, isDefault: true }, { id: "synthetic-library-branch", name: "Library counter", active: false, status: "DISABLED" as const, paymentStatus: "CLOSED" as const, isDefault: false }];
const state = { branches, verification: { ready: true, key: true, callback: true, lastSuccess: null }, payments: { ready: true, key: true, callback: true, lastSuccess: null, reason: null } };
let configuration: { url: string; enabled: boolean; branchIds: string[] } | null = url.searchParams.has("empty") ? null : { url: "https://synthetic-receiver.example/events", enabled: !url.searchParams.has("disabled"), branchIds: [branches[0].id] };
const keys = [{ id: "synthetic-key", name: "Campus till", keyPrefix: "a1b2c3d4e5f6", createdAt: "2026-10-17T10:00:00Z", lastUsedAt: null, revokedAt: null, scopes: ["payments:create", "payments:read", "payments:cancel"], branchIds: [branches[0].id] }];
window.fetch = async (request, options) => {
 const path = String(request);
 if (path.includes("/history")) throw new Error("Delivery history must not be requested by the portal UI.");
 if (path.includes("api-keys")) { if (options?.method === "POST") return Response.json({ id: "synthetic-new-key", ...JSON.parse(options.body as string), prefix: "synthetic", token: "unify_vk_synthetic_once", createdAt: "2026-10-17T10:00:00Z" }); return Response.json(options?.method === "DELETE" ? { revoked: true } : keys); }
 if (url.searchParams.has("config-error")) return Response.json({}, { status: 503 });
 if (options?.method === "PUT") { configuration = { ...JSON.parse(options.body as string), enabled: true }; return Response.json({ configuration, secret: "synthetic-payment-once", signingSecret: "synthetic-verification-once" }); }
 if (options?.method === "DELETE") { if (configuration) configuration.enabled = false; return Response.json({ disabled: true }); }
 return Response.json(options?.method === "POST" ? { queued: true } : configuration);
};
const kind = url.pathname.endsWith("/payments") ? "payments" : "verification";
const isAccess = screen.startsWith("access-");
const content = screen === "time" ? <section><h2>SAST time review</h2><p data-testid="timestamp">{formatSastDateTime("2026-12-31T22:30:00Z")}</p><p data-testid="export">{sastIsoTimestamp("2026-12-31T22:30:00Z")}</p><p data-testid="date">{sastDateKey("2026-12-31T22:30:00Z")}</p><label>Suspension ends (SAST)<input type="datetime-local" onChange={event => { document.getElementById("scheduled-result")!.textContent = sastInputToUtc(event.target.value); }} /></label><p id="scheduled-result" /></section> : isAccess ? <PaymentAccessFixture screen={screen} /> : legacyIntegrationDestination(url.pathname, url.search, url.hash) ? <LegacyIntegrationRedirect /> : screen === "loading" ? <Loading /> : screen === "error" ? <ErrorBoundary reset={() => window.location.reload()} /> : url.pathname.endsWith("/keys") ? <IntegrationKeysContent branches={branches} initialApiKeys={keys} preset={url.searchParams.get("preset") === "payments" ? "payments" : "verification"} returnTo={url.searchParams.get("returnTo") === "payments" ? "payments" : url.searchParams.get("returnTo") === "verification" ? "verification" : undefined} /> : <IntegrationWorkflow kind={kind} baseUrl="https://synthetic-portal.example" state={state} />;
createRoot(document.getElementById("root")!).render(["/", "/welcome"].includes(url.pathname) ? <WelcomePage /> : <div data-portal={screen.startsWith("access-admin") ? "admin" : "vendor"} className="min-h-screen bg-bg text-fg"><div className="sticky top-0 z-30 flex h-16 items-center border-b border-border bg-surface px-5"><span className="text-lg font-semibold text-brand-700">UNIFY</span><span className="ml-4 text-sm text-fg-muted">Synthetic review</span></div><main className="mx-auto max-w-6xl px-4 py-6 sm:px-8">{isAccess ? content : <IntegrationRouteShell>{content}</IntegrationRouteShell>}</main></div>);
