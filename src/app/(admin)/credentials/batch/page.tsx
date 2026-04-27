import { SectionHeader } from "@/components/layout/SectionHeader";
import { getBatchIssuancePreview } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";

export default async function BatchIssuePage() {
  await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER"]);

  const preview = await getBatchIssuancePreview();

  return (
    <div className="space-y-6">
      <SectionHeader title="Batch issue" description="Prepare simulated student VC issuance runs." />
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-zinc-500">Cohort</dt>
            <dd className="mt-1 font-medium text-zinc-950">{preview.cohortId}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500">Requested count</dt>
            <dd className="mt-1 font-medium text-zinc-950">{preview.requestedCount}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500">Status</dt>
            <dd className="mt-1 font-medium text-zinc-950">{preview.status}</dd>
          </div>
        </dl>
        <button className="mt-6 h-10 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white" type="button">
          Queue batch
        </button>
      </section>
    </div>
  );
}
