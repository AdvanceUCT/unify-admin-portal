import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import AdminLoading from "@/app/(admin)/loading";
import VendorPortalLoading from "@/app/vendor/(portal)/loading";
import { SettingsSectionLoading } from "@/components/layout/PortalRouteLoading";
import * as adminSkeletons from "@/components/layout/skeletons/AdminPageSkeletons";
import * as vendorSkeletons from "@/components/layout/skeletons/VendorPageSkeletons";
import * as detailSkeletons from "@/components/layout/skeletons/DetailPageSkeletons";

function pageDirectories(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return pageDirectories(entryPath);
    return entry.name === "page.tsx" ? [directory] : [];
  });
}

afterEach(cleanup);

describe("portal loading states", () => {
  it("renders an accessible admin route loading state", () => {
    render(<AdminLoading />);

    expect(
      screen.getByRole("status", { name: "Loading admin overview" }),
    ).toBeInTheDocument();
  });

  it("renders an accessible vendor route loading state", () => {
    render(<VendorPortalLoading />);

    expect(
      screen.getByRole("status", { name: "Loading vendor overview" }),
    ).toBeInTheDocument();
  });

  it("renders an accessible streamed settings-section fallback", () => {
    render(
      <SettingsSectionLoading
        action
        label="Loading billing operations"
        rows={8}
      />,
    );

    expect(
      screen.getByRole("status", { name: "Loading billing operations" }),
    ).toBeInTheDocument();
  });

  it("gives every admin and vendor page its own loading boundary, including detail routes", () => {
    const directories = ["(admin)", "vendor/(portal)"].flatMap((portal) =>
      pageDirectories(path.join(process.cwd(), "src/app", portal)),
    );
    const missing = directories
      .filter((directory) => !existsSync(path.join(directory, "loading.tsx")))
      .map((directory) => path.relative(process.cwd(), directory));

    expect(directories.length).toBeGreaterThan(40);
    expect(missing).toEqual([]);
  });

  for (const [name, Skeleton] of Object.entries({
    ...adminSkeletons,
    ...vendorSkeletons,
    ...detailSkeletons,
  })) {
    it(`${name} announces loading once without exposing placeholder controls`, () => {
      const { container } = render(<Skeleton />);
      const statuses = screen.getAllByRole("status");

      expect(statuses).toHaveLength(1);
      expect(statuses[0]).toHaveAccessibleName(/^Loading /);
      expect(statuses[0]).toHaveAttribute("aria-live", "polite");
      expect(
        container.querySelector("button, input, select, textarea, a"),
      ).toBeNull();
      const blocks = container.querySelectorAll(".bg-surface-muted");
      expect(blocks.length).toBeGreaterThan(0);
      for (const block of blocks) {
        expect(block).toHaveAttribute("aria-hidden", "true");
        expect(block).toHaveClass("motion-safe:animate-pulse");
        expect(block).not.toHaveClass("animate-pulse");
      }
    });
  }
});
