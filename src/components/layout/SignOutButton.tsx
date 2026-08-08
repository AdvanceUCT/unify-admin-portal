"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth/auth-client";
import { confirmDiscardUnsavedChanges } from "@/hooks/useUnsavedChangesWarning";

export function SignOutButton({ redirectTo = "/sign-in" }: { redirectTo?: string }) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSignOut() {
    if (!(await confirmDiscardUnsavedChanges())) return;

    setErrorMessage(null);
    setIsPending(true);

    try {
      const result = await authClient.signOut();
      if (result.error) {
        setErrorMessage("Sign out failed. Try again.");
        return;
      }

      router.push(redirectTo);
      router.refresh();
    } catch {
      setErrorMessage("Sign out failed. Try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {errorMessage ? (
        <span className="text-sm text-red-700" role="alert">
          {errorMessage}
        </span>
      ) : null}
      <button
        className="h-9 rounded-md border border-zinc-200 px-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        onClick={handleSignOut}
        type="button"
      >
        {isPending ? "Signing out..." : "Sign out"}
      </button>
    </div>
  );
}
