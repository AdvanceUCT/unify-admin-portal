"use client";

import { useSignOut } from "@/hooks/useSignOut";

export function SignOutButton({ redirectTo = "/sign-in" }: { redirectTo?: string }) {
  const { errorMessage, isPending, signOut } = useSignOut(redirectTo);

  return (
    <div className="flex items-center gap-2">
      {errorMessage ? (
        <span className="text-sm text-danger-fg" role="alert">
          {errorMessage}
        </span>
      ) : null}
      <button
        className="h-9 rounded-md border border-border px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        onClick={signOut}
        type="button"
      >
        {isPending ? "Signing out..." : "Sign out"}
      </button>
    </div>
  );
}
