import { SectionHeader } from "@/components/layout/SectionHeader";
import { requireRole } from "@/lib/auth/session";
import { getUniversityProfile } from "@/lib/university/profile";
import { updateRenewalCadenceAction } from "./actions";

export default async function RenewalSettingsPage() {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER", "VIEWER"]);
  const canWrite = session.user.role === "SUPER_ADMIN" || session.user.role === "ADMIN";

  const profile = await getUniversityProfile();
  const currentMonths = profile?.renewalCadenceMonths ?? "";

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Renewal settings"
        description="Choose how often issued credentials renew automatically. Individual credentials can still be renewed on demand from a student's page."
      />
      <section className="max-w-md rounded-lg border border-zinc-200 bg-white p-5">
        <form action={updateRenewalCadenceAction} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700" htmlFor="months">
              Renewal cadence
            </label>
            <select
              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-800 focus:border-zinc-500 focus:outline-none disabled:bg-zinc-100 disabled:text-zinc-500"
              defaultValue={String(currentMonths)}
              disabled={!canWrite}
              id="months"
              name="months"
            >
              <option value="">Off — no automatic renewal</option>
              <option value="6">Every 6 months (per semester)</option>
              <option value="12">Every 12 months (per year)</option>
            </select>
          </div>
          {canWrite ? (
            <button
              className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-950 bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
              type="submit"
            >
              Save
            </button>
          ) : (
            <p className="text-xs text-zinc-500">Only Admins and Super Admins can change this setting.</p>
          )}
        </form>
      </section>
    </div>
  );
}
