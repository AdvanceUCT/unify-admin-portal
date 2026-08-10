"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { SquarePen } from "lucide-react";

import { Dialog } from "@/components/ui/Dialog";
import { INVITABLE_ADMIN_ROLES, ROLE_LABELS, type AdminRole } from "@/lib/auth/roles";

/**
 * Replaces a `<select defaultValue={currentRole}>` + submit button pair.
 * That version relied on the browser <select>'s uncontrolled state, which
 * doesn't re-sync once `revalidatePath` refreshes the row — the same class
 * of staleness bug as the vendor filter bar's Reset button (see
 * VendorVerificationsFilterBar.tsx). Seeding `selectedRole` fresh from
 * `currentRole` every time the dialog opens avoids it entirely, the same way
 * BranchMultiSelect does.
 */
export function ChangeRoleButton({
  action,
  currentRole,
  userId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  currentRole: AdminRole;
  userId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<AdminRole>(currentRole);
  const formRef = useRef<HTMLFormElement>(null);

  function open() {
    setSelectedRole(currentRole);
    setIsOpen(true);
  }

  function save() {
    // flushSync guarantees the hidden "role" input's DOM value reflects
    // selectedRole before requestSubmit reads the form — see
    // BranchMultiSelect.tsx's `apply()` for the same technique.
    flushSync(() => setIsOpen(false));
    formRef.current?.requestSubmit();
  }

  return (
    <>
      <form action={action} ref={formRef}>
        <input name="userId" type="hidden" value={userId} />
        <input name="role" type="hidden" value={selectedRole} />
      </form>

      <button
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
        onClick={open}
        type="button"
      >
        {ROLE_LABELS[currentRole]}
        <SquarePen aria-hidden="true" size={13} />
      </button>

      <Dialog isOpen={isOpen} onClose={() => setIsOpen(false)} title="Change role">
        <div className="divide-y divide-border rounded-md border border-border">
          {INVITABLE_ADMIN_ROLES.map((role) => (
            <label
              className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm text-fg transition hover:bg-surface-muted/60"
              key={role}
            >
              <input
                checked={selectedRole === role}
                className="accent-brand-600"
                name="role-preview"
                onChange={() => setSelectedRole(role)}
                type="radio"
              />
              {ROLE_LABELS[role]}
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="h-9 rounded-md border border-border bg-surface px-4 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
            onClick={() => setIsOpen(false)}
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-9 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700"
            onClick={save}
            type="button"
          >
            Save role
          </button>
        </div>
      </Dialog>
    </>
  );
}
