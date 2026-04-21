import { SectionHeader } from "@/components/layout/SectionHeader";
import { getEligibilityRules } from "@/lib/api/client";

export default async function RulesPage() {
  const rules = await getEligibilityRules();

  return (
    <div className="space-y-6">
      <SectionHeader title="Eligibility rules" description="Prototype rules applied during verification and payments." />
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
