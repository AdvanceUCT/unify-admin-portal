import { render, screen } from "@testing-library/react";
import { Gauge, ShieldCheck } from "lucide-react";
import { describe, expect, it } from "vitest";
import { PortalShell } from "@/components/layout/PortalShell";

describe("PortalShell", () => {
  it("renders navigation and session context", () => {
    render(
      <PortalShell
        context="Credential governance"
        navItems={[
          { href: "/", label: "Overview", icon: Gauge },
          { href: "/vendor/help", label: "Help", icon: Gauge },
        ]}
        productName="UNIFY Admin"
        sessionLabel="Demo Admin · Admin"
        utilityIcon={ShieldCheck}
      >
        <p>Shell content</p>
      </PortalShell>,
    );

    expect(screen.getAllByText("UNIFY Admin").length).toBeGreaterThan(0);
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Help")).toBeInTheDocument();
    expect(screen.getByText("Shell content")).toBeInTheDocument();
  });
});
