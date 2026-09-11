import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import AdminLoading from "@/app/(admin)/loading";
import VendorPortalLoading from "@/app/vendor/(portal)/loading";
import { SettingsSectionLoading } from "@/components/layout/PortalRouteLoading";

afterEach(cleanup);

describe("portal loading states", () => {
  it("renders an accessible admin route loading state", () => {
    render(<AdminLoading />);

    expect(screen.getByRole("status", { name: "Loading admin page" })).toBeInTheDocument();
  });

  it("renders an accessible vendor route loading state", () => {
    render(<VendorPortalLoading />);

    expect(screen.getByRole("status", { name: "Loading vendor page" })).toBeInTheDocument();
  });

  it("renders an accessible streamed settings-section fallback", () => {
    render(<SettingsSectionLoading action label="Loading billing operations" rows={8} />);

    expect(screen.getByRole("status", { name: "Loading billing operations" })).toBeInTheDocument();
  });
});
