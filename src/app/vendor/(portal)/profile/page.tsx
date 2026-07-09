import { SectionHeader } from "@/components/layout/SectionHeader";
import { requireVendorSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export default async function VendorProfilePage() {
  const session = await requireVendorSession();
  const profile = await prisma.vendorProfile.findUnique({
    where: { userId: session.user.id },
  });

  return (
    <div className="space-y-6">
      <SectionHeader title="Vendor profile" description="Your company details on file." />

      <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
        <div>
          <p className="text-sm font-medium text-zinc-500">Company name</p>
          <p className="text-zinc-950">{profile?.companyName ?? "—"}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-500">Service category</p>
          <p className="text-zinc-950">{profile?.serviceCategory ?? "—"}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-500">Contact person name</p>
          <p className="text-zinc-950">{profile?.contactPersonName ?? "—"}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-500">Contact email</p>
          <p className="text-zinc-950">{profile?.contactEmail ?? "—"}</p>
        </div>
      </section>
      {/* TODO: editing the profile fields above is out of scope for this pass. */}
    </div>
  );
}
