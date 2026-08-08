import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  confirmDiscardUnsavedChanges,
  hasUnsavedChanges,
  registerUnsavedChangesDialog,
  useUnsavedChangesWarning,
} from "@/hooks/useUnsavedChangesWarning";

const routerPush = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

function GuardedPage() {
  useUnsavedChangesWarning(true);
  return <a href="/vendor/profile">Profile</a>;
}

beforeEach(() => {
  routerPush.mockReset();
  vi.spyOn(window.history, "back").mockImplementation(() => undefined);
  vi.spyOn(window.history, "forward").mockImplementation(() => undefined);
  if (!crypto.randomUUID) {
    Object.defineProperty(crypto, "randomUUID", {
      configurable: true,
      value: () => "guard-token",
    });
  }
});

afterEach(() => {
  registerUnsavedChangesDialog(null);
  vi.restoreAllMocks();
});

describe("useUnsavedChangesWarning", () => {
  it("blocks same-origin navigation until the user confirms", async () => {
    const showDialog = vi.fn().mockResolvedValue(true);
    registerUnsavedChangesDialog(showDialog);
    const view = render(<GuardedPage />);

    fireEvent.click(screen.getByRole("link", { name: "Profile" }));

    await waitFor(() => {
      expect(showDialog).toHaveBeenCalledOnce();
      expect(routerPush).toHaveBeenCalledWith("/vendor/profile");
    });
    view.unmount();
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("keeps the user on the page when navigation is declined", async () => {
    registerUnsavedChangesDialog(vi.fn().mockResolvedValue(false));
    const view = render(<GuardedPage />);

    fireEvent.click(screen.getByRole("link", { name: "Profile" }));

    await waitFor(() => expect(routerPush).not.toHaveBeenCalled());
    expect(hasUnsavedChanges()).toBe(true);
    await expect(confirmDiscardUnsavedChanges()).resolves.toBe(false);
    view.unmount();
  });
});
