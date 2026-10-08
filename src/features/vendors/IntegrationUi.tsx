"use client";

import { Check, Copy, Info } from "lucide-react";
import { useState, type ComponentProps, type ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import {
  integrationButton,
  integrationFocus,
  type IntegrationFeedback,
} from "./integrationStyles";

export function IntegrationBadge(props: ComponentProps<typeof Badge>) {
  return (
    <span className="[&>span]:text-sm">
      <Badge {...props} />
    </span>
  );
}

export function IntegrationFeedbackMessage({
  feedback,
}: {
  feedback: IntegrationFeedback;
}) {
  if (!feedback) return null;
  return (
    <p
      role={feedback.kind === "error" ? "alert" : "status"}
      className={`rounded-md border px-4 py-3 text-base ${feedback.kind === "error" ? "border-danger-border bg-danger-bg text-danger-fg" : "border-info-border bg-info-bg text-info-fg"}`}
    >
      {feedback.text}
    </p>
  );
}

export function IntegrationNotice({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <aside className="flex gap-3 rounded-md border border-brand-100 bg-brand-50 p-4 text-brand-900">
      <Info aria-hidden className="mt-1 size-5 shrink-0" />
      <div className="min-w-0">
        <h3 className="text-base font-semibold">{title}</h3>
        <div className="mt-1 text-base leading-relaxed">{children}</div>
      </div>
    </aside>
  );
}

export function IntegrationCodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  return (
    <div className="min-w-0">
      <div className="overflow-hidden rounded-md bg-brand-900 text-white">
        <div className="flex items-center justify-between border-b border-white/15 px-4 py-2">
          <span className="text-sm font-medium">Code example</span>
          <button
            aria-label="Copy code example"
            type="button"
            className="rounded p-2 text-white hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(children);
                setCopied(true);
                setError(false);
              } catch {
                setError(true);
                setCopied(false);
              }
            }}
          >
            {copied ? (
              <Check aria-hidden size={18} />
            ) : (
              <Copy aria-hidden size={18} />
            )}
          </button>
        </div>
        <pre className="overflow-x-auto p-5 font-mono text-sm leading-6">
          <code>{children}</code>
        </pre>
      </div>
      {copied && (
        <p role="status" className="mt-2 text-sm text-fg-muted">
          Example copied.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger-fg">
          Unable to copy. Select and copy the example manually.
        </p>
      )}
    </div>
  );
}

export function IntegrationDetails({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="min-w-0 rounded-md border border-border">
      <summary
        className={`cursor-pointer px-4 py-3 text-lg font-semibold text-fg ${integrationFocus}`}
      >
        {title}
      </summary>
      <div className="min-w-0 space-y-4 border-t border-border p-4 text-base">
        {children}
      </div>
    </details>
  );
}

export function IntegrationSecret({
  value,
  label,
  onHide,
  onCopy,
  payment = false,
}: {
  value: string;
  label: string;
  onHide: () => void;
  onCopy: () => void;
  payment?: boolean;
}) {
  return (
    <div className="space-y-3 rounded-md border border-warning-border bg-warning-bg p-4 text-warning-fg">
      <p className="font-semibold">{label}</p>
      <p>
        Copy it now and store it on your server. It will not be shown again
        after you leave this tab.
      </p>
      <code
        className="block break-all font-mono text-sm"
        data-payment-signing-secret={payment ? "" : undefined}
      >
        {value}
      </code>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={integrationButton} onClick={onCopy}>
          Copy secret
        </button>
        <button type="button" className={integrationButton} onClick={onHide}>
          Hide secret
        </button>
      </div>
    </div>
  );
}
