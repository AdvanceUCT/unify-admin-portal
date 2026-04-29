import Link from "next/link";

const tabs = [
  {
    href: "/users",
    label: "Users",
  },
  {
    href: "/users/invites",
    label: "Invites",
  },
] as const;

export function UserManagementTabs({ active }: { active: "users" | "invites" }) {
  return (
    <nav aria-label="User management sections" className="flex gap-2 border-b border-zinc-200">
      {tabs.map((tab) => {
        const isActive =
          (active === "users" && tab.href === "/users") ||
          (active === "invites" && tab.href === "/users/invites");

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
              isActive
                ? "border-zinc-950 text-zinc-950"
                : "border-transparent text-zinc-500 hover:text-zinc-950"
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
