"use client";
import { useEffect, useState } from "react";
import { revealIntegrationAnchor } from "@/lib/vendors/integrationNavigation";
export function WorkflowOutline({ kind }: { kind: "verification" | "payments" }) {
  const sections = [["setup", "Setup"], ...(kind === "payments" ? [["refunds", "Refunds"]] : []), ["webhooks", "Webhooks"], ["troubleshooting", "Troubleshooting"]];
  const [active, setActive] = useState("setup");
  useEffect(() => {
    const reveal = () => { revealIntegrationAnchor(); setActive(window.location.hash.slice(1) || "setup"); };
    let frame = 0;
    const trackSection = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const ids = ["setup", ...(kind === "payments" ? ["refunds"] : []), "webhooks", "troubleshooting"];
        const current = ids.filter(id => (document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) <= 180).at(-1);
        if (current) setActive(current);
      });
    };
    reveal(); window.addEventListener("hashchange", reveal); window.addEventListener("scroll", trackSection, { passive: true });
    return () => { window.removeEventListener("hashchange", reveal); window.removeEventListener("scroll", trackSection); window.cancelAnimationFrame(frame); };
  }, [kind]);
  return <>
    <div className="sticky top-16 z-20 -mx-1 bg-surface px-1 py-3 lg:hidden"><label className="flex items-center gap-3 text-sm font-medium">Jump to<select aria-label="Jump to integration section" className="min-h-11 min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-3 text-base" value={sections.some(([id]) => id === active) ? active : "setup"} onChange={event => { window.location.hash = event.target.value; }} >{sections.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div>
    <aside className="hidden lg:col-start-2 lg:row-start-1 lg:sticky lg:top-24 lg:block"><nav aria-label="On this page" className=" space-y-1 border-l border-border pl-4"><p className="mb-3 text-sm font-semibold text-fg-muted">On this page</p>{sections.map(([id, label]) => <a key={id} href={`#${id}`} aria-current={active === id ? "location" : undefined} className="block min-h-11 content-center text-base font-medium text-brand-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600">{label}</a>)}</nav></aside>
  </>;
}
