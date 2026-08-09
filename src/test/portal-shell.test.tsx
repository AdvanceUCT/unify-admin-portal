import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { isNavItemActive, resolveActiveNavItem } from "@/components/layout/navigation";
import { PortalShell } from "@/components/layout/PortalShell";
import { SidebarNav } from "@/components/layout/SidebarNav";
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

  it("titles a page reached through a collapsible group by the child, not the parent", () => {
    const items: PortalNavItem[] = [
      {
        href: "/credentials/issuance",
        label: "Issue Credentials",
        icon: "application",
        children: [
          { href: "/credentials/issuance/batch", label: "Batch issuance" },
          { href: "/credentials/issuance/individual", label: "Individual issuance" },
        ],
      },
    ];

    expect(resolveActiveNavItem("/credentials/issuance/batch", items)?.label).toBe(
      "Batch issuance",
    );
  });
});

describe("isNavItemActive", () => {
  const parent: PortalNavItem = {
    href: "/credentials/issuance",
    label: "Issue Credentials",
    icon: "application",
    children: [
      { href: "/credentials/issuance/batch", label: "Batch issuance" },
      { href: "/credentials/issuance/individual", label: "Individual issuance" },
    ],
  };

  it("keeps the parent active while on any of its children's routes", () => {
    expect(isNavItemActive("/credentials/issuance/batch", parent)).toBe(true);
    expect(isNavItemActive("/credentials/issuance/individual", parent)).toBe(true);
  });

  it("is not active on an unrelated route", () => {
    expect(isNavItemActive("/students", parent)).toBe(false);
  });
});

describe("SidebarNav collapsible groups", () => {
  const groupedNavItems: PortalNavItem[] = [
    {
      href: "/credentials/issuance",
      label: "Issue Credentials",
      icon: "application",
      children: [
        { href: "/credentials/issuance/batch", label: "Batch issuance" },
        { href: "/credentials/issuance/individual", label: "Individual issuance" },
      ],
    },
  ];

  it("auto-expands and marks only the parent current when on a child route", () => {
    render(<SidebarNav navItems={groupedNavItems} pathname="/credentials/issuance/batch" />);

    const parentToggle = screen.getByRole("button", { name: "Issue Credentials" });
    expect(parentToggle).toHaveAttribute("aria-expanded", "true");
    expect(parentToggle.className).toContain("nav-item-active");

    const batchLink = screen.getByRole("link", { name: "Batch issuance" });
    expect(batchLink).toBeInTheDocument();
    expect(batchLink).not.toHaveAttribute("aria-current");
  });

  it("stays collapsed by default off any child route, and toggles open on click", () => {
    render(<SidebarNav navItems={groupedNavItems} pathname="/students" />);

    expect(screen.queryByRole("link", { name: "Batch issuance" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Issue Credentials" }));

    expect(screen.getByRole("link", { name: "Batch issuance" })).toBeInTheDocument();
  });

  it("selects the parent on expand and unselects it on collapse, independent of route", () => {
    render(<SidebarNav navItems={groupedNavItems} pathname="/students" />);

    const parentToggle = screen.getByRole("button", { name: "Issue Credentials" });
    expect(parentToggle.className).not.toContain("nav-item-active");

    fireEvent.click(parentToggle);
    expect(parentToggle).toHaveAttribute("aria-expanded", "true");
    expect(parentToggle.className).toContain("nav-item-active");

    fireEvent.click(parentToggle);
    expect(parentToggle).toHaveAttribute("aria-expanded", "false");
    expect(parentToggle.className).not.toContain("nav-item-active");
  });

  it("unselects the parent on manual collapse even while still on a child route", () => {
    render(<SidebarNav navItems={groupedNavItems} pathname="/credentials/issuance/batch" />);

    const parentToggle = screen.getByRole("button", { name: "Issue Credentials" });
    expect(parentToggle.className).toContain("nav-item-active");

    fireEvent.click(parentToggle);

    expect(parentToggle).toHaveAttribute("aria-expanded", "false");
    expect(parentToggle.className).not.toContain("nav-item-active");
  });

  const mixedNavItems: PortalNavItem[] = [
    { href: "/students", label: "Students", icon: "students" },
    ...groupedNavItems,
  ];

  it("deselects another currently-selected tab when a group is expanded", () => {
    render(<SidebarNav navItems={mixedNavItems} pathname="/students" />);

    const studentsLink = screen.getByRole("link", { name: "Students" });
    expect(studentsLink.className).toContain("nav-item-active");

    fireEvent.click(screen.getByRole("button", { name: "Issue Credentials" }));

    expect(studentsLink.className).not.toContain("nav-item-active");
    expect(studentsLink).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "Issue Credentials" }).className).toContain(
      "nav-item-active",
    );
  });

  it("does not deselect an expanded group the instant another tab is clicked — only once the route actually changes", () => {
    // Starts somewhere neither item matches, so nothing is selected by route.
    const { rerender } = render(<SidebarNav navItems={mixedNavItems} pathname="/settings" />);

    const parentToggle = screen.getByRole("button", { name: "Issue Credentials" });
    fireEvent.click(parentToggle);
    expect(parentToggle.className).toContain("nav-item-active");

    // Clicking "Students" fires the navigation, but `pathname` (from
    // usePathname()) hasn't updated yet — selection must not jump ahead of
    // the page that's still loading.
    fireEvent.click(screen.getByRole("link", { name: "Students" }));
    expect(parentToggle.className).toContain("nav-item-active");
    expect(screen.getByRole("link", { name: "Students" }).className).not.toContain(
      "nav-item-active",
    );

    // Now simulate Next.js finishing the navigation and usePathname updating.
    rerender(<SidebarNav navItems={mixedNavItems} pathname="/students" />);

    expect(screen.getByRole("link", { name: "Students" }).className).toContain("nav-item-active");
    expect(screen.queryByRole("button", { name: "Issue Credentials" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("link", { name: "Batch issuance" })).not.toBeInTheDocument();
  });

  it("keeps the parent selected — and does not flash another tab selected — when a child link is clicked", () => {
    // `pathname` is fixed at "/students" for the whole test, standing in for
    // the moment right after a click, before Next.js has actually updated the
    // route. If selection fell back to route-derived state here, "Students"
    // would incorrectly reappear selected — exactly the bug being guarded
    // against, since a real navigation is asynchronous and briefly leaves the
    // route stale in exactly the same way.
    render(<SidebarNav navItems={mixedNavItems} pathname="/students" />);

    fireEvent.click(screen.getByRole("button", { name: "Issue Credentials" }));
    fireEvent.click(screen.getByRole("link", { name: "Batch issuance" }));

    expect(screen.getByRole("button", { name: "Issue Credentials" }).className).toContain(
      "nav-item-active",
    );
    expect(screen.getByRole("link", { name: "Students" }).className).not.toContain(
      "nav-item-active",
    );
  });
});
