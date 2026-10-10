import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VendorIntegrationSettings } from "@/features/vendors/VendorIntegrationSettings";
import { CallbackSettings } from "@/features/vendors/integrations/CallbackSettings";
import { IntegrationDocs } from "@/features/vendors/integrations/IntegrationDocs";
import { CopyButton } from "@/features/vendors/integrations/IntegrationUi";
const branches = [{ id: "branch", name: "Campus till", active: true, status: "ACTIVE", paymentStatus: "ACTIVE", isDefault: true }, { id: "inactive", name: "Old till", active: false, status: "DISABLED", paymentStatus: "DISABLED", isDefault: false }];
const key = { id: "key", name: "Till key", keyPrefix: "prefix", createdAt: "2026-10-07T10:00:00Z", revokedAt: null, lastUsedAt: null, scopes: ["payments:read"], branchIds: ["branch"] };
const history = { items: [], nextCursor: null, lastSuccess: null, oldestOutstanding: null };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); vi.spyOn(window, "confirm").mockReturnValue(true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("API key settings", () => {
  it("requires branch access and keeps refund permissions an explicit choice", async () => {
    const fetcher = vi.mocked(fetch).mockResolvedValue(response({ id: "new", name: "Till", prefix: "abcdef", token: "unify_vk_abcdef_secret", createdAt: key.createdAt, scopes: ["payments:create", "payments:read", "payments:cancel"], branchIds: ["branch"] }));
    render(<VendorIntegrationSettings branches={branches} initialApiKeys={[]} initialPreset="payments" />);
    fireEvent.change(screen.getByLabelText("Key name"), { target: { value: "Till" } });
    expect(screen.getByRole("button", { name: "Create API key" })).toBeDisabled();
    expect(screen.getByLabelText("Allow refunds and refund recovery")).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: /Campus till/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create API key" }));
    await screen.findByText("unify_vk_abcdef_secret");
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ name: "Till", scopes: ["payments:create", "payments:read", "payments:cancel"], branchIds: ["branch"] });
    fireEvent.click(screen.getByRole("button", { name: "Hide secret" }));
    expect(screen.queryByText("unify_vk_abcdef_secret")).not.toBeInTheDocument();
    expect(localStorage.length).toBe(0);
  });
  it("prevents duplicate creation and never automatically retries a lost response", async () => {
    let reject: (error: Error) => void = () => {};
    const fetcher = vi.mocked(fetch).mockImplementationOnce(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise; })).mockResolvedValue(response([key]));
    render(<VendorIntegrationSettings branches={branches} initialApiKeys={[]} />);
    fireEvent.change(screen.getByLabelText("Key name"), { target: { value: "Website" } });
    const create = screen.getByRole("button", { name: "Create API key" }); fireEvent.click(create); fireEvent.click(create);
    expect(fetcher).toHaveBeenCalledTimes(1);
    reject(new Error("Network lost"));
    await screen.findByText(/A key may have been created/);
    expect(fetcher.mock.calls.filter(c => c[1]?.method === "POST")).toHaveLength(1);
    await screen.findByText("Till key");
  });
  it("requires confirmation before revoking an active key", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    render(<VendorIntegrationSettings branches={branches} initialApiKeys={[key]} />);
    fireEvent.click(screen.getByRole("button", { name: "Revoke Till key" }));
    expect(fetch).not.toHaveBeenCalled();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Pending refunds remain bound"));
  });
  it("requires the default verification branch when a custom key is restricted", () => {
    render(<VendorIntegrationSettings branches={branches} initialApiKeys={[]} />);
    fireEvent.change(screen.getByLabelText("Key name"), { target: { value: "Restricted" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Old till/ }));
    expect(screen.getByText("Include the default branch to start checkout verification.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create API key" })).toBeDisabled();
  });
});
describe("callback settings", () => {
  function stubCallbacks(configuration: unknown, records: unknown = history) {
    return vi.mocked(fetch).mockImplementation(async url => response(String(url).includes("/history") ? records : configuration));
  }
  it("loads verification history and retries using the stored request, not editable fields", async () => {
    const records = { ...history, items: [{ id: "attempt", verificationId: "verification", verificationRequestId: "request", checkoutId: "order", verificationStatus: "APPROVED", attemptNumber: 2, status: "FAILED", httpStatus: 500, attemptedAt: "2026-10-07T10:00:00Z", failureReason: "Receiver did not accept the callback." }] };
    const fetcher = stubCallbacks({ url: "https://receiver.example/events", enabled: true }, records);
    render(<CallbackSettings kind="verification" branches={branches} />);
    await screen.findByText("order");
    fireEvent.change(screen.getByLabelText("HTTPS destination"), { target: { value: "https://edited.example/events" } });
    fireEvent.click(screen.getByRole("button", { name: "Retry to current destination" }));
    await waitFor(() => expect(fetcher.mock.calls.some(c => c[0] === "/api/vendor/verifications/request/retry" && c[1]?.method === "POST")).toBe(true));
    expect(fetcher.mock.calls.find(c => c[1]?.method === "POST")![1]).not.toHaveProperty("body");
  });
  it("requires explicit confirmation for replacement and does not repeat ambiguous saves", async () => {
    const fetcher = stubCallbacks({ url: "https://receiver.example/events", enabled: true });
    render(<CallbackSettings kind="verification" branches={branches} />);
    const save = await screen.findByRole("button", { name: "Save and replace secret" });
    await waitFor(() => expect(save).toBeEnabled());
    vi.mocked(window.confirm).mockReturnValueOnce(false); fireEvent.click(save);
    expect(fetcher.mock.calls.filter(c => c[1]?.method === "PUT")).toHaveLength(0);
    fetcher.mockImplementationOnce(async () => { throw new Error("Lost response"); }); fireEvent.click(save);
    await screen.findByText(/Do not automatically repeat/);
    expect(fetcher.mock.calls.filter(c => c[1]?.method === "PUT")).toHaveLength(1);
  });
  it("keeps parked payment history visible when delivery is disabled and disables retry", async () => {
    const records = { ...history, items: [{ id: "event", eventType: "payment_request.paid", requestId: "sale", createdAt: "2026-10-07T10:00:00Z", delivery: { status: "PARKED", nextAttemptAt: null, attempts: [] } }] };
    stubCallbacks({ url: "https://receiver.example/events", enabled: false, branchIds: ["branch"] }, records);
    render(<CallbackSettings kind="payments" branches={branches} />);
    await screen.findByText("Parked");
    expect(screen.getByRole("button", { name: "Retry to current destination" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "sale" })).toHaveAttribute("href", "/vendor/payment-requests/sale");
    expect(screen.getByLabelText(/Old till/)).toBeDisabled();
  });
  it("offers recovery from a failed initial load", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("Offline"));
    render(<CallbackSettings kind="verification" branches={branches} />);
    await screen.findByText(/Unable to load callbacks/);
    expect(screen.getByRole("button", { name: "Save and reveal secret" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reload configuration" })).toBeEnabled();
  });
});
describe("developer guidance", () => {
  it("searches endpoint actions and changes generated code language", () => {
    render(<IntegrationDocs baseUrl="https://portal.example" branches={branches} />);
    fireEvent.change(screen.getByLabelText("Search API endpoints"), { target: { value: "Cancel a pending refund" } });
    expect(screen.getByRole("heading", { name: "Cancel a pending refund" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Create a sale" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Example language"), { target: { value: "node" } });
    expect(screen.getByRole("button", { name: "Copy Cancel a pending refund Node.js request" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search API endpoints"), { target: { value: "does-not-exist" } });
    expect(screen.getByText(/No endpoints match/)).toBeInTheDocument();
  });
  it("explains explicit execution and preserves unknown outcomes in the refund guide", () => {
    render(<IntegrationDocs baseUrl="https://portal.example" branches={branches} guide="refunds" />);
    expect(screen.getByRole("heading", { name: "Execute explicitly" })).toBeInTheDocument();
    expect(screen.getAllByText(/missing records and malformed responses/).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Troubleshooting" })).toHaveAttribute("href", "/vendor/integrations/reference#troubleshooting");
  });
  it("provides a manual copy fallback when the clipboard is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("Blocked")) } });
    render(<CopyButton value="example" />); fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await screen.findByText("Copy failed. Select and copy the text manually.");
  });
});
