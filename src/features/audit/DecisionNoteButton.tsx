"use client";

import { useState } from "react";
import { FileText } from "lucide-react";

import { Dialog } from "@/components/ui/Dialog";

export function DecisionNoteButton({ companyName, note }: { companyName: string; note: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <FileText aria-hidden="true" size={14} />
        View note
      </button>

      <Dialog isOpen={isOpen} onClose={() => setIsOpen(false)} title={`Decision note — ${companyName}`}>
        <p className="whitespace-pre-wrap">{note}</p>
      </Dialog>
    </>
  );
}
