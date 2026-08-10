/**
 * @fileoverview Renders the Import Section Tabs used by `/students/import/ImportSectionTabs.tsx`.
 * @module app/(admin)/students/import/ImportSectionTabs
 */

import { PageTabs } from "@/components/layout/PageTabs";

export function ImportSectionTabs({ active }: { active: "upload" | "fields" }) {
  return (
    <PageTabs
      tabs={[
        { href: "/students/import", isActive: active === "upload", label: "Upload" },
        { href: "/students/import/fields", isActive: active === "fields", label: "Manage fields" },
      ]}
    />
  );
}
