import { SectionHeader } from "@/components/layout/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { getVendors } from "@/lib/api/client";

export default async function VendorsPage() {
  const vendors = await getVendors();

  return (
    <div className="space-y-6">
      <SectionHeader title="Vendors" description="Service providers awaiting approval or already provisioned." />
      <section className="rounded-lg border border-zinc-200 bg-white">
        <div className="divide-y divide-zinc-100">
          {vendors.map((vendor) => (
            <div className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_auto_auto]" key={vendor.id}>
              <div>
                <h2 className="font-medium text-zinc-950">{vendor.name}</h2>
                <p className="text-sm text-zinc-500">{vendor.serviceCategory}</p>
              </div>
              <Badge tone={vendor.status === "Approved" ? "success" : "warning"}>{vendor.status}</Badge>
              <button className="h-9 rounded-md border border-zinc-300 px-3 text-sm font-medium" type="button">
                Review
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
