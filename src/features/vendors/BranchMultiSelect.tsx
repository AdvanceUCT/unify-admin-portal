"use client";

import { Search, SquarePen } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { Dialog } from "@/components/ui/Dialog";

const MAX_VISIBLE_CHIPS = 3;

/**
 * Plain wrapped checkboxes fall apart once a vendor has more than a handful
 * of branches — with ~20 they'd wrap across several lines in every staff row
 * and in the invite form. This collapses the selection to a few summary
 * chips plus an "Edit" trigger that opens a searchable checklist in a
 * Dialog, so the row/form stays a fixed, predictable size no matter how many
 * branches exist. Renders hidden inputs for the selected ids under `name`,
 * so it drops into an existing `<form action={serverAction}>` the same way
 * a plain checkbox group would — `formData.getAll(name)` still works.
 *
 * `submitOnApply` skips the extra standalone "Save" button some callers used
 * to pair this with — Apply commits the selection *and* submits the
 * enclosing form immediately. The commit has to go through `flushSync`
 * rather than a plain `setSelectedIds`: submitting reads the hidden
 * `<input>`s' current DOM values via `requestSubmit()`, and without
 * `flushSync` that DOM update wouldn't have committed yet (state updates are
 * batched/async), so the submit would fire with the *previous* selection.
 */
export function BranchMultiSelect({
  branches,
  defaultSelectedIds = [],
  name,
  submitOnApply = false,
  triggerLabel = "Edit branches",
}: {
  branches: { id: string; name: string }[];
  defaultSelectedIds?: string[];
  name: string;
  submitOnApply?: boolean;
  triggerLabel?: string;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(defaultSelectedIds);
  const [draftIds, setDraftIds] = useState<string[]>(defaultSelectedIds);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedBranches = useMemo(
    () => branches.filter((branch) => selectedIds.includes(branch.id)),
    [branches, selectedIds],
  );
  const filteredBranches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? branches.filter((branch) => branch.name.toLowerCase().includes(normalized)) : branches;
  }, [branches, query]);

  function open() {
    setDraftIds(selectedIds);
    setQuery("");
    setIsOpen(true);
  }

  function toggle(id: string) {
    setDraftIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  function apply() {
    if (submitOnApply) {
      flushSync(() => setSelectedIds(draftIds));
      containerRef.current?.closest("form")?.requestSubmit();
    } else {
      setSelectedIds(draftIds);
    }
    setIsOpen(false);
  }

  const allSelected = branches.length > 0 && selectedIds.length === branches.length;
  const visibleChips = allSelected ? [] : selectedBranches.slice(0, MAX_VISIBLE_CHIPS);
  const overflowCount = selectedBranches.length - visibleChips.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5" ref={containerRef}>
      {selectedIds.map((id) => (
        <input key={id} name={name} type="hidden" value={id} />
      ))}

      {allSelected ? (
        <span className="rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700">All branches</span>
      ) : selectedBranches.length === 0 ? (
        <span className="text-xs text-fg-subtle">No branches assigned</span>
      ) : (
        <>
          {visibleChips.map((branch) => (
            <span className="rounded-md bg-surface-muted px-2 py-1 text-xs font-medium text-fg-muted" key={branch.id}>
              {branch.name}
            </span>
          ))}
          {overflowCount > 0 && (
            <span className="rounded-md bg-surface-muted px-2 py-1 text-xs font-medium text-fg-subtle">
              +{overflowCount} more
            </span>
          )}
        </>
      )}

      <button
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
        onClick={open}
        type="button"
      >
        <SquarePen aria-hidden="true" size={13} />
        {triggerLabel}
      </button>

      <Dialog isOpen={isOpen} onClose={() => setIsOpen(false)} title="Select branches">
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            autoFocus
            className="h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search branches"
            value={query}
          />
        </div>

        <div className="mt-2 flex items-center justify-between text-xs">
          <p className="text-fg-subtle">{draftIds.length} of {branches.length} selected</p>
          <div className="flex items-center gap-3">
            <button
              className="font-medium text-fg-muted hover:text-fg"
              onClick={() => setDraftIds(branches.map((branch) => branch.id))}
              type="button"
            >
              Select all
            </button>
            <button className="font-medium text-fg-muted hover:text-fg" onClick={() => setDraftIds([])} type="button">
              Clear
            </button>
          </div>
        </div>

        <div className="mt-2 max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {filteredBranches.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-fg-subtle">No branches match &quot;{query}&quot;.</p>
          ) : (
            filteredBranches.map((branch) => (
              <label className="flex items-center gap-2.5 px-3 py-2 text-sm text-fg transition hover:bg-surface-muted/60" key={branch.id}>
                <input
                  checked={draftIds.includes(branch.id)}
                  className="size-3.5 shrink-0 rounded border-border accent-brand-600"
                  onChange={() => toggle(branch.id)}
                  type="checkbox"
                />
                {branch.name}
              </label>
            ))
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            className="h-9 rounded-md border border-border px-4 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
            onClick={() => setIsOpen(false)}
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-9 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700"
            onClick={apply}
            type="button"
          >
            {submitOnApply ? "Save" : "Apply selection"}
          </button>
        </div>
      </Dialog>
    </div>
  );
}
