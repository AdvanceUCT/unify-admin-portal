"use client";
import { useEffect, useEffectEvent, useState } from "react";

/** Poll persisted progress without overlapping requests or background-tab traffic. */
export function useBatchPolling<T>(initial: T, active: (value: T) => boolean, load: (signal: AbortSignal) => Promise<T>, interval: number) {
  const [value, setValue] = useState(initial);
  const [pollError, setPollError] = useState<string | null>(null);
  const loadLatest = useEffectEvent((signal: AbortSignal) => load(signal));
  const isActive = active(value);
  useEffect(() => {
    if (!isActive) return;
    let stopped = false;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      if (stopped || document.hidden) return;
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const next = await loadLatest(request.signal);
        if (!stopped && !request.signal.aborted) { setValue(next); setPollError(null); }
      } catch {
        if (!stopped && !request.signal.aborted) setPollError("Connection interrupted. Reconnecting to batch progress...");
      } finally {
        if (!stopped && !request.signal.aborted && !document.hidden) timer = setTimeout(poll, interval);
      }
    }
    function visibilityChanged() {
      clearTimeout(timer);
      controller?.abort();
      if (!document.hidden) void poll();
    }
    document.addEventListener("visibilitychange", visibilityChanged);
    timer = setTimeout(poll, interval);
    return () => { stopped = true; clearTimeout(timer); controller?.abort(); document.removeEventListener("visibilitychange", visibilityChanged); };
  }, [isActive, interval]);
  return { value, setValue, pollError };
}
