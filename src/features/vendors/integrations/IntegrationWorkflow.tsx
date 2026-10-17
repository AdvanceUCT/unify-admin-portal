import type { integrationOverview } from "@/lib/vendors/integrationOverview";
import { troubleshooting } from "@/lib/vendors/integrationGuide";
import { WorkflowGuide } from "./WorkflowGuide";
import { WorkflowOutline } from "./WorkflowOutline";
import { CallbackSettings } from "./CallbackSettings";
export function IntegrationWorkflow({ kind, state, baseUrl }: { kind: "verification" | "payments"; state: Awaited<ReturnType<typeof integrationOverview>>; baseUrl: string }) {
  const flow = state[kind];
  const help = troubleshooting.filter(([code]) => kind === "payments" || code.startsWith("401") || code.startsWith("MISSING_SCOPE") || code.startsWith("BRANCH_NOT_ALLOWED"));
  return <div className="grid min-w-0 items-start gap-x-8 lg:grid-cols-[minmax(0,1fr)_11rem]">
    <WorkflowOutline kind={kind} />
    <div className="min-w-0 space-y-9 lg:col-start-1 lg:row-start-1">
      <WorkflowGuide kind={kind} branches={state.branches} baseUrl={baseUrl} ready={flow.ready} hasKey={flow.key} reason={kind === "payments" ? state.payments.reason : null} />
      <CallbackSettings key={kind} kind={kind} branches={state.branches} />
      <section id="troubleshooting" className="scroll-mt-44 space-y-4 border-t border-border pt-7"><h2 className="text-2xl font-semibold">Troubleshooting</h2>{help.map(([code, text]) => <details key={code}><summary className="cursor-pointer break-words font-medium">{code}</summary><p className="mt-2 text-fg-muted">{text}</p></details>)}</section>
    </div>
  </div>;
}
