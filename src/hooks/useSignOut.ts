"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { confirmDiscardUnsavedChanges } from "@/hooks/useUnsavedChangesWarning";
import { authClient } from "@/lib/auth/auth-client";

/**
 * Shared sign-out behaviour. Extracted so the standalone SignOutButton and the
 * header user menu cannot drift apart — in particular the unsaved-changes
 * guard, which must run before the session is torn down.
 */
export function useSignOut(redirectTo = "/sign-in") {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const signOut = useCallback(async () => {
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
  }, [redirectTo, router]);

  return { errorMessage, isPending, signOut };
}
