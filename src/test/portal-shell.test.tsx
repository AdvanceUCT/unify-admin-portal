import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { resolveActiveNavItem } from "@/components/layout/navigation";
import { PortalShell } from "@/components/layout/PortalShell";
import type { PortalNavItem } from "@/components/layout/portalTypes";

const navItems: PortalNavItem[] = [
  { href: "/", label: "Overview", icon: "overview" },
  { href: "/students", label: "Students", icon: "students" },
  { href: "/vendor/help", label: "Help", icon: "help" },
];

// Vitest `globals` is off, so RTL's automatic cleanup does not run.
afterEach(cleanup);

function renderShell() {
  return render(
    <PortalShell
      brand={{ brandName: "Unify", tenantName: "Example University" }}
      fallbackTitle="Admin"
      navItems={navItems}
      portal="admin"
      settingsHref="/settings"
      user={{
        email: "demo@example.edu",
        name: "Demo Admin",
        roleLabel: "Admin",
      }}
    >
      <p>Shell content</p>
    </PortalShell>,
  );
}

describe("PortalShell", () => {
  it("renders navigation, brand identity and content", () => {
    renderShell();

    expect(screen.getAllByText("Unify").length).toBeGreaterThan(0);
    expect(screen.getByText("Example University")).toBeInTheDocument();
    expect(screen.getAllByText("Overview").length).toBeGreaterThan(0);
    expect(screen.getByText("Students")).toBeInTheDocument();
    expect(screen.getByText("Help")).toBeInTheDocument();
    expect(screen.getByText("Shell content")).toBeInTheDocument();
  });

  it("titles the header from the active nav item and marks it current", () => {
    renderShell();

    // The mocked pathname is "/", so Overview is active.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Overview");
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows the user's name and role, and applies the portal accent", () => {
    const { container } = renderShell();

    expect(screen.getByText("Demo Admin")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(container.querySelector("[data-portal='admin']")).not.toBeNull();
  });
});

describe("resolveActiveNavItem", () => {
  it("matches the root only exactly", () => {
    expect(resolveActiveNavItem("/", navItems)?.href).toBe("/");
    expect(resolveActiveNavItem("/settings", navItems)).toBeNull();
  });

  it("keeps the parent lit on nested routes", () => {
    expect(resolveActiveNavItem("/students/import", navItems)?.href).toBe("/students");
  });

  it("prefers the longest matching href", () => {
    const items: PortalNavItem[] = [
      { href: "/vendor", label: "Overview", icon: "overview" },
      { href: "/vendor/branches", label: "Branches", icon: "branches" },
    ];

    expect(resolveActiveNavItem("/vendor/branches/abc", items)?.href).toBe(
      "/vendor/branches",
    );
    expect(resolveActiveNavItem("/vendor", items)?.href).toBe("/vendor");
  });

  it("does not partially match a sibling segment", () => {
    expect(resolveActiveNavItem("/students-archive", navItems)).toBeNull();
  });
});
