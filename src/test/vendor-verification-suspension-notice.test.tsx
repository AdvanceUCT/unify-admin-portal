import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/vendor" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

import { VendorVerificationSuspensionNotice } from "@/app/vendor/(portal)/VendorVerificationSuspensionNotice";

function renderNotice(pathname: string, canPayInvoices = true) {
  navigation.pathname = pathname;
  return render(
    <VendorVerificationSuspensionNotice
      canPayInvoices={canPayInvoices}
      reason="Invoice DEMO-2026-000001 was due 15 Sept 2026"
      suspendedAtIso="2026-09-16T00:00:00.000Z"
    />,
  );
}

describe("VendorVerificationSuspensionNotice", () => {
  afterEach(() => cleanup());

  it("links owners to their invoices from other vendor pages", () => {
    renderNotice("/vendor/verifications");

    expect(screen.getByRole("alert")).toHaveTextContent("Verification suspended");
    expect(screen.getByRole("link", { name: "View invoices" })).toHaveAttribute("href", "/vendor/invoices");
  });

  it("drops the invoices link on the invoices page itself", () => {
    renderNotice("/vendor/invoices");

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View invoices" })).not.toBeInTheDocument();
  });

  it("leaves invoice detail pages to render their own notice", () => {
    renderNotice("/vendor/invoices/invoice-1");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("never offers staff the invoices link", () => {
    renderNotice("/vendor/verifications", false);

    expect(screen.getByRole("alert")).toHaveTextContent("Ask the account owner");
    expect(screen.queryByRole("link", { name: "View invoices" })).not.toBeInTheDocument();
  });
});
