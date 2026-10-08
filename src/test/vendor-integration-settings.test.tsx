import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationsTabs } from "@/features/vendors/IntegrationsTabs";
import {
  VendorApiKeySettings,
  VerificationWebhookSettings,
} from "@/features/vendors/VendorIntegrationSettings";
import { PaymentWebhookSettings } from "@/features/vendors/PaymentWebhookSettings";

const branches = [
  { id: "main", name: "Main branch", paymentEligible: true, isDefault: true },
  { id: "old", name: "Old branch", paymentEligible: false },
];
const emptyHistory = {
  items: [],
  nextCursor: null,
  lastSuccess: null,
  oldestOutstanding: null,
};
const paymentConfig = {
  id: "config",
  url: "https://receiver.example/payments",
  enabled: true,
  branchIds: ["main"],
};
const event = {
  id: "event-1",
  requestId: "request-1",
  branchId: "main",
  eventType: "payment_request.paid",
  createdAt: "2026-10-08T10:00:00Z",
  delivery: {
    status: "EXHAUSTED",
    nextAttemptAt: null,
    attempts: [
      {
        sequence: 1,
        outcome: "FAILED",
        httpStatus: 500,
        errorCode: "HTTP_REJECTED",
        startedAt: "2026-10-08T10:00:00Z",
        completedAt: "2026-10-08T10:00:01Z",
      },
    ],
  },
};
let configuration: typeof paymentConfig | null;
let history:
  | typeof emptyHistory
  | {
      items: (typeof event)[];
      nextCursor: string | null;
      lastSuccess: null;
      oldestOutstanding: null;
    };
const apiKey = {
  id: "key-1",
  name: "Production",
  prefix: "abcdef123456",
  token: "unify_vk_once-only-key",
  createdAt: "2026-10-08T10:00:00Z",
  scopes: ["verification:create", "verification:read"],
  branchIds: [],
};
let fetchMock: ReturnType<typeof vi.fn>;

function mount(
  initialWebhook: { url: string; enabled: boolean } | null = null,
  selectedBranches = branches,
) {
  return render(
    <IntegrationsTabs
      website={<VerificationWebhookSettings initialWebhook={initialWebhook} />}
      payments={<PaymentWebhookSettings branches={selectedBranches} />}
      keys={
        <VendorApiKeySettings branches={selectedBranches} initialApiKeys={[]} />
      }
    />,
  );
}
function tab(name: string) {
  fireEvent.click(screen.getByRole("tab", { name }));
}
async function loaded() {
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Refresh history" }),
    ).toBeEnabled(),
  );
}
function enterKey(name = "Production") {
  tab("API keys");
  fireEvent.change(screen.getByLabelText("Key name"), {
    target: { value: name },
  });
}

beforeEach(() => {
  configuration = null;
  history = emptyHistory;
  fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.includes("/payment-webhook")) {
      if (url.includes("/history")) return Response.json(history);
      if (options?.method === "PUT") {
        configuration = {
          ...paymentConfig,
          ...JSON.parse(options.body as string),
        };
        return Response.json({ configuration, secret: "payment-secret-once" });
      }
      if (options?.method === "DELETE") {
        if (configuration) configuration = { ...configuration, enabled: false };
        return Response.json({ disabled: true });
      }
      if (options?.method === "POST")
        return Response.json({ queued: true, deliveryId: "delivery-1" });
      return Response.json(configuration);
    }
    if (url.endsWith("/api-keys"))
      return Response.json({
        ...apiKey,
        ...JSON.parse(options?.body as string),
      });
    if (url.includes("/api-keys/")) return Response.json({ revoked: true });
    return Response.json(
      options?.method === "DELETE"
        ? { disabled: true }
        : {
            url: "https://receiver.example/verification",
            signingSecret: "verification-secret-once",
          },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Integration tabs and credentials", () => {
  it("supports arrow keys, wrapping, Home and End with roving focus and associated panels", () => {
    mount();
    const website = screen.getByRole("tab", { name: "Website verification" });
    const keys = screen.getByRole("tab", { name: "API keys" });
    website.focus();
    fireEvent.keyDown(website, { key: "ArrowLeft" });
    expect(keys).toHaveFocus();
    expect(keys).toHaveAttribute("aria-selected", "true");
    expect(website).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "id",
      keys.getAttribute("aria-controls"),
    );
    fireEvent.keyDown(keys, { key: "Home" });
    expect(website).toHaveFocus();
    fireEvent.keyDown(website, { key: "End" });
    expect(keys).toHaveFocus();
    fireEvent.keyDown(keys, { key: "ArrowRight" });
    expect(website).toHaveFocus();
  });
  it("retains entered forms across tabs, submits exact scopes and branches, and clears a revealed key on departure", async () => {
    mount();
    enterKey();
    expect(
      screen.getByRole("checkbox", { name: /Start verification/ }),
    ).toBeChecked();
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Create payment requests/ }),
    );
    expect(screen.getByRole("button", { name: "Create key" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Main branch" }));
    tab("Website verification");
    tab("API keys");
    expect(screen.getByLabelText("Key name")).toHaveValue("Production");
    expect(screen.getByRole("checkbox", { name: "Main branch" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    expect(await screen.findByText(apiKey.token)).toBeVisible();
    const create = fetchMock.mock.calls.find(([url]) =>
      url.endsWith("/api-keys"),
    );
    expect(JSON.parse(create![1].body)).toEqual({
      name: "Production",
      scopes: ["verification:create", "verification:read", "payments:create"],
      branchIds: ["main"],
    });
    tab("Website verification");
    tab("API keys");
    expect(screen.queryByText(apiKey.token)).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Main branch" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Revoke Production" }));
    expect(await screen.findByText("Revoked")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/vendor/integrations/api-keys/key-1",
      { method: "DELETE" },
    );
  });
  it("keeps failed input, reports network failures, and prevents duplicate submissions", async () => {
    mount();
    enterKey("Retry checkout");
    let reject: (reason: Error) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((_resolve, rejectPromise) => {
          reject = rejectPromise;
        }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    expect(screen.getByRole("button", { name: /Creating key/ })).toBeDisabled();
    expect(screen.getByLabelText("Key name")).toBeDisabled();
    await act(async () => reject(new Error("Network unavailable")));
    expect(screen.getByRole("alert")).toHaveTextContent("Network unavailable");
    expect(screen.getByLabelText("Key name")).toHaveValue("Retry checkout");
  });
  it("does not reveal a secret when a creation response arrives after leaving and returning", async () => {
    mount();
    enterKey();
    let resolve: (response: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolvePromise) => {
          resolve = resolvePromise;
        }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    tab("POS payments");
    tab("API keys");
    await act(async () => resolve(Response.json(apiKey)));
    expect(screen.queryByText(apiKey.token)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Revoke Production" }),
    ).toBeVisible();
  });
  it("handles clipboard failure without losing a newly generated key", async () => {
    mount();
    enterKey();
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    await screen.findByText(apiKey.token);
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(
      new Error("Denied"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy secret" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to copy",
    );
    expect(screen.getByText(apiKey.token)).toBeVisible();
  });
});

describe("Verification webhook", () => {
  it("saves, rotates, disables, preserves URL entry and clears secrets between tabs", async () => {
    mount();
    fireEvent.change(
      within(screen.getByRole("tabpanel")).getByLabelText("HTTPS destination"),
      { target: { value: "https://receiver.example/verification" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save webhook" }));
    expect(await screen.findByText("verification-secret-once")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/vendor/integrations/webhook",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ url: "https://receiver.example/verification" }),
      }),
    );
    tab("API keys");
    tab("Website verification");
    expect(
      screen.queryByText("verification-secret-once"),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("tabpanel")).getByLabelText("HTTPS destination"),
    ).toHaveValue("https://receiver.example/verification");
    fireEvent.click(
      screen.getByRole("button", { name: "Save and rotate secret" }),
    );
    expect(await screen.findByText("verification-secret-once")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Disable webhook" }));
    await screen.findByText("Verification webhook disabled.");
    expect(screen.getByText("Disabled")).toBeVisible();
    expect(
      screen.queryByText("verification-secret-once"),
    ).not.toBeInTheDocument();
  });
  it("reports server validation failures without discarding the destination", async () => {
    mount();
    fetchMock.mockImplementationOnce(async () =>
      Response.json(
        { error: { message: "Use a public HTTPS destination." } },
        { status: 400 },
      ),
    );
    fireEvent.change(
      within(screen.getByRole("tabpanel")).getByLabelText("HTTPS destination"),
      { target: { value: "https://private.example" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save webhook" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Use a public HTTPS destination.",
    );
    expect(
      within(screen.getByRole("tabpanel")).getByLabelText("HTTPS destination"),
    ).toHaveValue("https://private.example");
  });
});

describe("Payment callbacks", () => {
  it("blocks ineligible branches and allows removing a previously configured unavailable branch", async () => {
    configuration = { ...paymentConfig, branchIds: ["old"] };
    mount();
    tab("POS payments");
    await loaded();
    expect(screen.getByRole("checkbox", { name: /Old branch/ })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Old branch/ })).toBeChecked();
    expect(
      screen.getByRole("button", {
        name: "Save replacement and reveal secret",
      }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove unavailable branch Old branch",
      }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Main branch" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Save replacement and reveal secret",
      }),
    );
    expect(await screen.findByText("payment-secret-once")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/vendor/integrations/payment-webhook",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ url: paymentConfig.url, branchIds: ["main"] }),
      }),
    );
    tab("Website verification");
    tab("POS payments");
    expect(screen.queryByText("payment-secret-once")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Disable delivery" }));
    await screen.findByText(
      "Delivery disabled. Outstanding events are parked.",
    );
    expect(
      screen.getByRole("button", { name: "Disable delivery" }),
    ).toBeDisabled();
  });
  it("refreshes, retries and paginates history without overwriting unsaved form input", async () => {
    configuration = paymentConfig;
    history = { ...emptyHistory, items: [event], nextCursor: "cursor-1" };
    mount();
    tab("POS payments");
    await loaded();
    const panel = screen.getByRole("tabpanel");
    fireEvent.change(within(panel).getByLabelText("HTTPS destination"), {
      target: { value: "https://edited.example/callback" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh history" }));
    await loaded();
    expect(within(panel).getByLabelText("HTTPS destination")).toHaveValue(
      "https://edited.example/callback",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry to current destination" }),
    );
    await screen.findByText("Retry queued for the current destination.");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/vendor/integrations/payment-webhook/events/event-1/retry",
      expect.objectContaining({ method: "POST" }),
    );
    await loaded();
    history = {
      ...emptyHistory,
      items: [{ ...event, id: "event-2", requestId: "request-2" }],
    };
    fireEvent.click(screen.getByRole("button", { name: "Load older events" }));
    await screen.findByRole("link", { name: "request-2" });
    expect(screen.getByRole("link", { name: "request-1" })).toBeVisible();
    expect(within(panel).getByLabelText("HTTPS destination")).toHaveValue(
      "https://edited.example/callback",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/vendor/integrations/payment-webhook/history?cursor=cursor-1",
      { cache: "no-store" },
    );
  });
  it("shows empty history and no eligible branches", async () => {
    mount(null, []);
    tab("POS payments");
    await loaded();
    expect(screen.getByText(/No eligible payment branches/)).toBeVisible();
    expect(screen.getByText("No callback events yet.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Save and reveal secret" }),
    ).toBeDisabled();
  });
  it("recovers an initial load failure and preserves input on a failed save", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Configuration unavailable"));
    mount();
    tab("POS payments");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Configuration unavailable",
    );
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Refresh history" }));
    await loaded();
    const url = within(screen.getByRole("tabpanel")).getByLabelText(
      "HTTPS destination",
    );
    fireEvent.change(url, {
      target: { value: "https://retry.example/callback" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Main branch" }));
    fetchMock.mockRejectedValueOnce(new Error("Network unavailable"));
    fireEvent.click(
      screen.getByRole("button", { name: "Save and reveal secret" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Network unavailable",
    );
    expect(url).toHaveValue("https://retry.example/callback");
    expect(screen.getByRole("checkbox", { name: "Main branch" })).toBeChecked();
  });
});
