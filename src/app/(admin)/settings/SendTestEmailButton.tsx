"use client";

import { useState, useTransition } from "react";

import { sendTestEmailAction } from "./actions";

export function SendTestEmailButton() {
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSendTestEmail() {
    startTransition(async () => {
      try {
        const result = await sendTestEmailAction();
        setMessage({
          isError: false,
          text: `Test email sent to ${result.to} via ${result.provider}.`,
        });
      } catch (error) {
        setMessage({
          isError: true,
          text: error instanceof Error ? error.message : "Failed to send test email.",
        });
      }
    });
  }

  return (
    <div className="mt-4 flex items-center gap-3 border-t border-zinc-100 pt-4">
      <button
        className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        onClick={handleSendTestEmail}
        type="button"
      >
        {isPending ? "Sending..." : "Send test email"}
      </button>

      {message ? (
        <span className={`text-sm ${message.isError ? "text-rose-700" : "text-emerald-700"}`}>
          {message.text}
        </span>
      ) : null}
    </div>
  );
}
