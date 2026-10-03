"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StudentFilterToolbar } from "@/features/students/StudentFilterToolbar";
import { renewalStatusLabel } from "@/lib/credentials/renewalPresentation";

export function RenewalFilters({ params, programmesByFaculty }: {
  params: Record<string, string>; programmesByFaculty: Record<string, string[]>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(params.student ?? "");
  const [faculty, setFaculty] = useState(params.faculty ?? "");
  const [programme, setProgramme] = useState(params.programme ?? "");
  const [status, setStatus] = useState(params.status ?? "");
  const [from, setFrom] = useState(params.from ?? "");
  const [to, setTo] = useState(params.to ?? "");
  const history = params.view === "history";
  const statuses = history ? ["AWAITING_ACTIVATION", "ACTIVATED", "FAILED", "NEEDS_ATTENTION", "SKIPPED", "CANCELLED"]
    : ["SCHEDULED", "OVERDUE", "DEFERRED", "PROCESSING", "RETRYING", "FAILED", "NEEDS_ATTENTION"];
  const programmes = [...new Set(faculty ? programmesByFaculty[faculty] ?? [] : Object.values(programmesByFaculty).flat())].sort();
  const baseParams = Object.fromEntries(Object.entries(params).filter(([key]) => ["view", "year", "periodStart", "periodExpiry"].includes(key)));
  function navigate(values: Record<string, string>) {
    const next = new URLSearchParams(baseParams);
    for (const [key, value] of Object.entries(values)) if (value.trim()) next.set(key, value.trim());
    router.push(`/credentials/issuance/renewals?${next}`);
  }
  const inputClass = "h-9 rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
  return <form onSubmit={(event) => { event.preventDefault(); navigate({ student: query, faculty, programme, status, from, to }); }}>
    <StudentFilterToolbar query={query} faculty={faculty} programme={programme}
      faculties={Object.keys(programmesByFaculty).sort()} programmes={programmes}
      onQueryChange={setQuery} onFacultyChange={(value) => { setFaculty(value); setProgramme(""); }} onProgrammeChange={setProgramme}
      onClear={() => { setQuery(""); setFaculty(""); setProgramme(""); setStatus(""); setFrom(""); setTo(""); navigate({}); }}>
      <select aria-label="Renewal status" className={inputClass} value={status} onChange={(event) => setStatus(event.target.value)}>
        <option value="">All renewal statuses</option>
        {statuses.map((value) => <option key={value} value={value}>{value === "AWAITING_ACTIVATION" ? "Offer sent" : value === "ACTIVATED" ? "Renewed" : renewalStatusLabel(value)}</option>)}
      </select>
      {history && <>
        <label className="flex items-center gap-2 text-xs text-fg-muted">From<input aria-label="From date" type="date" className={inputClass} value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="flex items-center gap-2 text-xs text-fg-muted">To<input aria-label="To date" type="date" className={inputClass} value={to} onChange={(event) => setTo(event.target.value)} /></label>
      </>}
      <button className="inline-flex h-9 items-center justify-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700">Apply</button>
      {(status || from || to) && !query && !faculty && !programme && <button type="button" className="h-9 rounded-md bg-surface-muted px-3 text-sm text-fg-muted" onClick={() => { setStatus(""); setFrom(""); setTo(""); navigate({}); }}>Clear</button>}
    </StudentFilterToolbar>
  </form>;
}
