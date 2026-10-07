"use client";
export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return <section role="alert" className="space-y-3"><h2 className="text-section-title">Unable to load integrations</h2><p className="text-sm text-fg-muted">Try loading the saved configuration again.</p><button type="button" className="rounded-md border border-border px-3 py-2 text-sm" onClick={reset}>Try again</button></section>;
}
