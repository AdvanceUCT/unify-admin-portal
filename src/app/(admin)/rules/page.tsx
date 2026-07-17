import { SectionHeader } from "@/components/layout/SectionHeader";
import { getEligibilityRules } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getUniversityProfile } from "@/lib/university/profile";
import { saveRenewalSettingsAction } from "./actions";

export default async function RulesPage() {
  await requireRole(["SUPER_ADMIN", "ADMIN"]);

  const [rules, profile] = await Promise.all([getEligibilityRules(), getUniversityProfile()]);

  return (
    <div className="space-y-6">
      <SectionHeader title="Credential rules" description="Configure validity, renewal, and prototype eligibility rules." />
      {profile ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-base font-semibold text-zinc-950">Validity and renewal</h2>
          <form action={saveRenewalSettingsAction} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-zinc-800">
              Default validity days
              <input
                className="mt-2 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-200"
                defaultValue={profile.defaultCredentialValidityDays}
                min={1}
                max={3650}
                name="defaultCredentialValidityDays"
                type="number"
              />
            </label>
            <label className="block text-sm font-medium text-zinc-800">
              Renewal cadence months
              <input
                className="mt-2 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-200"
                defaultValue={profile.renewalCadenceMonths}
                min={1}
                max={120}
                name="renewalCadenceMonths"
                type="number"
              />
            </label>
            <div className="sm:col-span-2">
              <button
                className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-3 text-sm font-medium text-white transition hover:bg-zinc-800"
                type="submit"
              >
                Save settings
              </button>
            </div>
          </form>
        </section>
      ) : null}
      <section className="rounded-lg border border-zinc-200 bg-white">
        <div className="divide-y divide-zinc-100">
          {rules.map((rule) => (
            <div className="px-5 py-4" key={rule.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-medium text-zinc-950">{rule.name}</h2>
                <span className="text-sm text-zinc-500">{rule.appliesTo}</span>
              </div>
              <p className="mt-2 text-sm text-zinc-600">{rule.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
