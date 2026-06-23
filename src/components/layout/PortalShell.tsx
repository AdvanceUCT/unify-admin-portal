import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { SignOutButton } from "@/components/layout/SignOutButton";

export type PortalNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export function PortalShell({
  children,
  context,
  navItems,
  productName,
  sessionLabel,
  signOutRedirectTo,
  utilityIcon: UtilityIcon,
}: {
  children: React.ReactNode;
  context: string;
  navItems: PortalNavItem[];
  productName: string;
  sessionLabel: string;
  signOutRedirectTo?: string;
  utilityIcon: LucideIcon;
}) {
  return (
    <div className="min-h-screen bg-[#f7f8fa] text-zinc-950">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-zinc-200 bg-white px-4 py-5 lg:block">
        <div className="flex items-center gap-3 px-2">
          <span className="grid size-10 place-items-center rounded-md bg-zinc-950 text-white">
            <UtilityIcon size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-medium text-zinc-500">{context}</p>
            <p className="font-semibold text-zinc-950">{productName}</p>
          </div>
        </div>
        <nav className="mt-8 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                className="flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-950"
                href={item.href}
                key={item.href}
              >
                <Icon size={18} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{context}</p>
              <p className="font-semibold text-zinc-950">{productName}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600">{sessionLabel}</span>
              <SignOutButton redirectTo={signOutRedirectTo} />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
      </div>
    </div>
  );
}
