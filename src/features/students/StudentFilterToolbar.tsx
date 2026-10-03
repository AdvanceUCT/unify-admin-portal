"use client";

import { ChevronDown, Search, X } from "lucide-react";

export function StudentFilterToolbar({ query, faculty, programme, faculties, programmes,
  onQueryChange, onFacultyChange, onProgrammeChange, onClear, children,
}: {
  query: string; faculty: string; programme: string;
  faculties: string[]; programmes: string[];
  onQueryChange: (value: string) => void;
  onFacultyChange: (value: string) => void;
  onProgrammeChange: (value: string) => void;
  onClear: () => void; children?: React.ReactNode;
}) {
  return <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-4 shadow-md">
    <div className="relative w-full sm:w-72">
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
      <input aria-label="Search students" className="h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm text-fg placeholder:text-fg-subtle transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        placeholder="Search by name or student number..." value={query} onChange={(event) => onQueryChange(event.target.value)} />
    </div>
    {[
      { label: "Faculty", value: faculty, options: faculties, placeholder: "All faculties", onChange: onFacultyChange },
      { label: "Programme", value: programme, options: programmes, placeholder: "All programmes", onChange: onProgrammeChange },
    ].map((filter) => <div key={filter.label} className="relative w-full sm:w-auto">
      <select aria-label={filter.label} className="h-9 w-full appearance-none rounded-md border border-border bg-surface pl-3 pr-8 text-sm text-fg transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 sm:w-52"
        value={filter.value} onChange={(event) => filter.onChange(event.target.value)}>
        <option value="">{filter.placeholder}</option>
        {filter.options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
    </div>)}
    {children}
    {(query || faculty || programme) && <button type="button" onClick={onClear} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-surface-muted px-3 text-sm font-medium text-fg-muted transition hover:bg-brand-50 hover:text-brand-700">
      <X aria-hidden className="size-3.5" />Clear
    </button>}
  </div>;
}
