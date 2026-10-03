import { LoaderCircle } from "lucide-react";

export default function BatchRunLoading() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-5 text-fg-muted" role="status">
      <LoaderCircle aria-hidden className="size-5 animate-spin" />
      Loading batch progress...
    </div>
  );
}
