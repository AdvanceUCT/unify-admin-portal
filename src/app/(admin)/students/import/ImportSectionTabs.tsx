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
