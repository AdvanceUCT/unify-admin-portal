import Link from "next/link";

const tabs = [
  { href: "/students/import", label: "Upload" },
  { href: "/students/import/fields", label: "Manage fields" },
] as const;

export function ImportSectionTabs({ active }: { active: "upload" | "fields" }) {
  return (
    <nav aria-label="Import sections" className="flex gap-2 border-b border-zinc-200">
      {tabs.map((tab) => {
        const isActive =
          (active === "upload" && tab.href === "/students/import") ||
          (active === "fields" && tab.href === "/students/import/fields");

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
              isActive ? "border-zinc-950 text-zinc-950" : "border-transparent text-zinc-500 hover:text-zinc-950"
            }`}
            href={tab.href}
            key={tab.href}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
