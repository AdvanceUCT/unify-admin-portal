"use client";
import { useEffect, useMemo, useRef } from "react";
/** Fence async results, including a leave-and-return during a one-time secret request. */
export function useIntegrationLifetime() {
  const scope = useRef({ active: true, generation: 0 });
  useEffect(() => { const current = scope.current; current.active = true; return () => { current.active = false; current.generation++; }; }, []);
  return useMemo(() => ({ capture: () => scope.current.generation, isCurrent: (generation: number) => scope.current.active && scope.current.generation === generation }), []);
}
