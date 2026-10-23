import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VendorIntegrationSettings } from "@/features/vendors/integrations/ApiKeySettings";
import { CallbackSettings } from "@/features/vendors/integrations/CallbackSettings";
const branches = [{ id: "main", name: "Main branch", active: true, status: "ACTIVE", paymentStatus: "ACTIVE", isDefault: true }, { id: "old", name: "Old branch", active: false, status: "ACTIVE", paymentStatus: null, isDefault: false }];
const empty = { items: [], nextCursor: null, lastSuccess: null };
const config = { url: "https://receiver.example/events", enabled: true, branchIds: ["main"] };
const key = { id: "key", name: "Checkout", prefix: "abcdef", token: "unify_vk_abcdef_synthetic", createdAt: "2026-10-17T10:00:00Z", scopes: ["verification:create", "verification:read"], branchIds: [] };
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => { fetcher = vi.fn(async (url: string, options?: RequestInit) => Response.json(url.includes("history") ? empty : options?.method === "PUT" ? { configuration: config, secret: "payment-once", signingSecret: "verification-once" } : options?.method === "POST" ? key : config)); vi.stubGlobal("fetch", fetcher); vi.spyOn(window, "confirm").mockReturnValue(true); Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const destination = async () => { const input = await screen.findByLabelText("HTTPS destination"); await waitFor(() => expect(input).toBeEnabled()); return input; };
describe("canonical integration credentials", () => {
  it("does not reveal an API key after leaving and returning during creation", async () => {
    const first = render(<VendorIntegrationSettings branches={branches} initialApiKeys={[]} />); fireEvent.change(screen.getByLabelText("Key name"), { target: { value: "Checkout" } });
    let resolve!: (value: Response) => void; fetcher.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; })); fireEvent.click(screen.getByRole("button", { name: "Create API key" })); first.unmount();
    render(<VendorIntegrationSettings branches={branches} initialApiKeys={[]} />); await act(async () => resolve(Response.json(key))); expect(screen.queryByText(key.token)).not.toBeInTheDocument(); expect(fetcher.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
  });
  it.each([500, 503])("recovers key history after an ambiguous HTTP %s without repeating creation", async status => {
    fetcher.mockResolvedValueOnce(Response.json({ error: { message: "Service unavailable" } }, { status })).mockResolvedValueOnce(Response.json([{ ...key, keyPrefix: key.prefix, token: undefined, revokedAt: null, lastUsedAt: null }]));
    render(<VendorIntegrationSettings branches={branches} initialApiKeys={[]} />); fireEvent.change(screen.getByLabelText("Key name"), { target: { value: "Checkout" } }); fireEvent.click(screen.getByRole("button", { name: "Create API key" }));
    await screen.findByText(/A key may have been created/); await screen.findByRole("heading", { name: "Checkout" }); expect(fetcher.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1); expect(screen.queryByText(key.token)).not.toBeInTheDocument();
  });
  it("retains a new key after clipboard failure and clears it explicitly", async () => {
    fetcher.mockResolvedValueOnce(Response.json(key)); render(<VendorIntegrationSettings branches={branches} initialApiKeys={[]} />); fireEvent.change(screen.getByLabelText("Key name"), { target: { value: "Checkout" } }); fireEvent.click(screen.getByRole("button", { name: "Create API key" })); await screen.findByText(key.token);
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("Denied")); fireEvent.click(screen.getByRole("button", { name: "Copy api key" })); await screen.findByText("Copy failed. Select and copy the text manually."); expect(screen.getByText(key.token)).toBeVisible(); fireEvent.click(screen.getByRole("button", { name: "Hide secret" })); expect(screen.queryByText(key.token)).not.toBeInTheDocument();
  });
});
describe("webhook settings controller", () => {
  it.each(["verification", "payments"] as const)("clears late %s secrets on route departure", async kind => {
    const mounted = render(<CallbackSettings kind={kind} branches={branches} />); await destination(); let resolve!: (value: Response) => void;
    fetcher.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; })); fireEvent.click(screen.getByRole("button", { name: "Save and replace secret" })); mounted.unmount(); render(<CallbackSettings kind={kind} branches={branches} />); await destination();
    await act(async () => resolve(Response.json({ secret: "late-secret", signingSecret: "late-secret" }))); expect(screen.queryByText("late-secret")).not.toBeInTheDocument();
  });
  it("keeps settings failure recoverable without requesting history", async () => {
    fetcher.mockResolvedValue(Response.json({}, { status: 503 }));
    render(<CallbackSettings kind="payments" branches={branches} />);
    await screen.findByText(/Unable to load webhooks/);
    expect(screen.getByRole("button", { name: "Save and reveal secret" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reload configuration" })).toBeEnabled();
    expect(fetcher.mock.calls.every(([url]) => !String(url).includes("history"))).toBe(true);
  });
  it("can remove a configured unavailable branch but cannot save it in a replacement", async () => {
    fetcher.mockImplementation(async url => Response.json(String(url).includes("history") ? empty : { ...config, branchIds: ["old"] })); render(<CallbackSettings kind="payments" branches={branches} />); await destination(); expect(screen.getByRole("button", { name: "Save and replace secret" })).toBeDisabled(); fireEvent.click(screen.getByLabelText(/Old branch/)); fireEvent.click(screen.getByLabelText(/Main branch/)); expect(screen.getByRole("button", { name: "Save and replace secret" })).toBeEnabled();
  });
  it("rotates and disables with confirmation without fetching history", async () => {
    render(<CallbackSettings kind="verification" branches={branches} />); await destination(); fetcher.mockImplementation(async (url, options) => String(url).includes("history") ? Response.json({}, { status: 503 }) : options?.method === "PUT" ? Response.json({ signingSecret: "verification-once" }) : Response.json(options?.method === "DELETE" ? { disabled: true } : config));
    fireEvent.click(screen.getByRole("button", { name: "Save and replace secret" })); await screen.findByText("verification-once"); expect(screen.getByText("verification-once")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: "Disable delivery" })).toBeEnabled());
    expect(fetcher.mock.calls.every(([url]) => !String(url).includes("history"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Disable delivery" })); await screen.findByText("Delivery disabled."); expect(screen.queryByText("verification-once")).not.toBeInTheDocument();
  });
});
