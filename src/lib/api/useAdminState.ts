"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminState } from "@/lib/api/types";

type UseAdminStateOptions = {
  initialState?: AdminState;
  pollMs?: number | null;
};

async function fetchAdminState() {
  const response = await fetch("/api/mock/admin-state", { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Admin state request failed with status ${response.status}.`);
  }

  return response.json() as Promise<AdminState>;
}

function shouldPoll(pollMs: number | null): pollMs is number {
  return pollMs !== null && Number.isFinite(pollMs) && pollMs > 0;
}

export function useAdminState({ initialState, pollMs = null }: UseAdminStateOptions = {}) {
  const shouldLoadOnMount = !initialState;
  const [state, setState] = useState<AdminState | null>(initialState ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(shouldLoadOnMount);

  const refresh = useCallback(async () => {
    const nextState = await fetchAdminState();
    setState(nextState);
    setError(null);
    setIsLoading(false);
    return nextState;
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const nextState = await fetchAdminState();

        if (isMounted) {
          setState(nextState);
          setError(null);
          setIsLoading(false);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : "Admin state request failed.");
          setIsLoading(false);
        }
      }
    }

    if (shouldLoadOnMount) {
      void load();
    }

    const intervalId = shouldPoll(pollMs) ? window.setInterval(() => void load(), pollMs) : undefined;

    return () => {
      isMounted = false;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [pollMs, shouldLoadOnMount]);

  return { error, isLoading, refresh, state };
}
