"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { integrationFocus } from "./integrationStyles";

export type IntegrationTab = "website" | "payments" | "keys";
const tabs: { id: IntegrationTab; label: string }[] = [
  { id: "website", label: "Website verification" },
  { id: "payments", label: "POS payments" },
  { id: "keys", label: "API keys" },
];

const SecretsContext = createContext<{
  generation: number;
  register: (tab: IntegrationTab, clear: () => void) => () => void;
  isCurrent: (tab: IntegrationTab, generation: number) => boolean;
} | null>(null);

/** Clear secrets on departure, including responses that arrive after switching tabs. */
export function useIntegrationSecret(tab: IntegrationTab) {
  const context = useContext(SecretsContext);
  const [secret, setSecret] = useState<string | null>(null);
  const register = context?.register;
  useEffect(() => register?.(tab, () => setSecret(null)), [register, tab]);
  const reveal = (value: string | null) => {
    if (!value || !context || context.isCurrent(tab, context.generation))
      setSecret(value);
  };
  return [secret, reveal] as const;
}

export function IntegrationsTabs({
  website,
  payments,
  keys,
}: {
  website: ReactNode;
  payments: ReactNode;
  keys: ReactNode;
}) {
  const [active, setActive] = useState<IntegrationTab>("website");
  const [generation, setGeneration] = useState(0);
  const current = useRef({ tab: "website" as IntegrationTab, generation: 0 });
  const clearers = useRef(new Map<IntegrationTab, Set<() => void>>());
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const register = useCallback((tab: IntegrationTab, clear: () => void) => {
    const group = clearers.current.get(tab) ?? new Set();
    group.add(clear);
    clearers.current.set(tab, group);
    return () => {
      group.delete(clear);
    };
  }, []);
  const isCurrent = useCallback(
    (tab: IntegrationTab, version: number) =>
      current.current.tab === tab && current.current.generation === version,
    [],
  );
  function select(tab: IntegrationTab) {
    if (tab === current.current.tab) return;
    clearers.current.get(current.current.tab)?.forEach((clear) => clear());
    current.current = { tab, generation: current.current.generation + 1 };
    setGeneration(current.current.generation);
    setActive(tab);
  }
  const panels = { website, payments, keys };
  return (
    <SecretsContext.Provider value={{ generation, register, isCurrent }}>
      <div className="min-w-0 space-y-8 rounded-lg border border-border bg-surface p-4 text-base leading-relaxed text-fg sm:p-8">
        <header>
          <h1 className="text-[2rem] font-bold leading-10 tracking-tight">
            Integrations
          </h1>
          <p className="mt-2 text-base text-fg-muted">
            Connect your website or POS to UNIFY.
          </p>
        </header>
        <div
          role="tablist"
          aria-label="Integration type"
          className="flex gap-2 overflow-x-auto border-b border-border sm:gap-6"
        >
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              ref={(element) => {
                buttons.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`${id}-${tab.id}-tab`}
              aria-controls={`${id}-${tab.id}-panel`}
              aria-selected={active === tab.id}
              tabIndex={active === tab.id ? 0 : -1}
              className={`shrink-0 border-b-[3px] px-2 py-3 text-base transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600 ${active === tab.id ? "border-brand-700 font-semibold text-brand-700" : "border-transparent font-medium text-fg-muted hover:text-fg"}`}
              onClick={() => select(tab.id)}
              onKeyDown={(event) => {
                const next =
                  event.key === "ArrowRight"
                    ? (index + 1) % tabs.length
                    : event.key === "ArrowLeft"
                      ? (index + tabs.length - 1) % tabs.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? tabs.length - 1
                          : null;
                if (next === null) return;
                event.preventDefault();
                select(tabs[next].id);
                buttons.current[next]?.focus();
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            id={`${id}-${tab.id}-panel`}
            aria-labelledby={`${id}-${tab.id}-tab`}
            hidden={active !== tab.id}
            tabIndex={0}
            className={`min-w-0 ${integrationFocus}`}
          >
            {panels[tab.id]}
          </div>
        ))}
      </div>
    </SecretsContext.Provider>
  );
}
