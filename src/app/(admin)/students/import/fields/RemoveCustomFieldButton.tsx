"use client";

import { useRef } from "react";

import { removeCustomFieldAction } from "./actions";

export function RemoveCustomFieldButton({
  fieldKey,
  requiresConfirmation,
  warning,
}: {
  fieldKey: string;
  requiresConfirmation: boolean;
  warning?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const confirmedRef = useRef<HTMLInputElement>(null);

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (!requiresConfirmation) return;

    event.preventDefault();
    const confirmed = window.confirm(warning ?? "Remove this custom field?");
    if (!confirmed) return;

    if (confirmedRef.current) {
      confirmedRef.current.value = "true";
    }
    formRef.current?.requestSubmit();
  }

  return (
    <form action={removeCustomFieldAction} ref={formRef}>
      <input name="key" type="hidden" value={fieldKey} />
      <input name="confirmed" ref={confirmedRef} type="hidden" value="false" />
      <button
        className="h-9 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
        onClick={handleClick}
        type="submit"
      >
        Remove
      </button>
    </form>
  );
}
