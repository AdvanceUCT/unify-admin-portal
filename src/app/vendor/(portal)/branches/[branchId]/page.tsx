import { notFound } from "next/navigation";
import QRCode from "qrcode";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { Metric } from "@/components/ui/Metric";
import { LiveVerificationList } from "@/features/vendors/LiveVerificationList";
import { QrCodeActions } from "@/features/vendors/QrCodeActions";
import { prisma } from "@/lib/db/prisma";
import { assertBranchAccess, requireApprovedVendorContext } from "@/lib/vendors/context";
import { encodeLiveVerificationCursor } from "@/lib/vendors/liveVerifications";
import { getVendorVerificationStats, listRecentVendorVerifications } from "@/lib/vendors/verifications";
import {
  normalizedVerificationAttributes,
  summarizeVerificationStudent,
  vendorVerificationFailureReason,
} from "@/lib/vendors/verificationContract";

import { retryBranchProvisioningAction, setBranchActiveAction, setDefaultBranchAction, updateBranchAction } from "../actions";

export default async function VendorBranchPage({ params }: { params: Promise<{ branchId: string }> }) {
  const { context } = await requireApprovedVendorContext();
  const { branchId } = await params;
  assertBranchAccess(context, branchId);
  const branch = await prisma.vendorBranch.findFirst({
    where: { id: branchId, vendorProfileId: context.vendorProfileId },
    include: { vendorProfile: { select: { defaultBranchId: true } } },
  });
  if (!branch) notFound();

  const [stats, history] = await Promise.all([
    getVendorVerificationStats(context.vendorProfileId, { branchIds: [branch.id], inPersonOnly: true }),
    listRecentVendorVerifications(context.vendorProfileId, 20, { branchIds: [branch.id], inPersonOnly: true }),
  ]);
  const qrSvg = branch.verificationUrl ? await QRCode.toString(branch.verificationUrl, { type: "svg", margin: 1 }) : null;
  const isDefault = branch.vendorProfile.defaultBranchId === branch.id;

  return (
    <div className="space-y-6">
      <SectionHeader title={branch.name} description={branch.address || "Physical verification service point"} />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={branch.status === "ACTIVE" ? "success" : branch.status === "PROVISIONING_FAILED" ? "danger" : "warning"}>{branch.status.replaceAll("_", " ")}</Badge>
        {isDefault && <Badge tone="neutral">Default checkout branch</Badge>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="In-person verifications" value={stats.total} detail="All time" />
        <Metric label="Approved" value={stats.approved} detail={stats.total ? `${Math.round((stats.approved / stats.total) * 100)}% approval rate` : "No results yet"} />
        <Metric label="Pending" value={stats.pending} detail="Awaiting response" />
        <Metric label="This month" value={stats.thisMonth} detail="Since the 1st" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col items-center gap-4 rounded-lg border border-zinc-200 bg-white p-6 text-center">
          {qrSvg ? <div className="size-52" dangerouslySetInnerHTML={{ __html: qrSvg }} aria-label={`${branch.name} verification QR code`} /> : <p className="py-20 text-sm text-zinc-500">Service point provisioning is incomplete.</p>}
          {qrSvg && <QrCodeActions svg={qrSvg} filename={`${branch.name.toLowerCase().replace(/\s+/g, "-")}-qr`} />}
          {branch.verificationUrl && <p className="max-w-full break-all text-xs text-zinc-500">{branch.verificationUrl}</p>}
        </section>

        {context.role === "OWNER" && (
          <section className="space-y-5 rounded-lg border border-zinc-200 bg-white p-5">
            <h2 className="font-medium text-zinc-950">Branch settings</h2>
            <form action={updateBranchAction} className="space-y-3">
              <input name="branchId" type="hidden" value={branch.id} />
              <label className="grid gap-1 text-sm font-medium">Name<input className="h-10 rounded-md border border-zinc-300 px-3 font-normal" defaultValue={branch.name} name="name" required /></label>
              <label className="grid gap-1 text-sm font-medium">Address<input className="h-10 rounded-md border border-zinc-300 px-3 font-normal" defaultValue={branch.address ?? ""} name="address" /></label>
              <button className="h-9 rounded-md bg-zinc-900 px-3 text-sm font-medium text-white" type="submit">Save changes</button>
            </form>
            <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
              {branch.status === "PROVISIONING_FAILED" && <form action={retryBranchProvisioningAction}><input name="branchId" type="hidden" value={branch.id} /><button className="h-9 rounded-md border border-zinc-300 px-3 text-sm font-medium" type="submit">Retry provisioning</button></form>}
              {!isDefault && branch.status === "ACTIVE" && <form action={setDefaultBranchAction}><input name="branchId" type="hidden" value={branch.id} /><button className="h-9 rounded-md border border-zinc-300 px-3 text-sm font-medium" type="submit">Make default</button></form>}
              {!isDefault && branch.agentServicePointId && <form action={setBranchActiveAction}><input name="branchId" type="hidden" value={branch.id} /><input name="active" type="hidden" value={branch.active ? "false" : "true"} /><button className="h-9 rounded-md border border-zinc-300 px-3 text-sm font-medium" type="submit">{branch.active ? "Disable branch" : "Reactivate branch"}</button></form>}
            </div>
          </section>
        )}
      </div>

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-5 py-4"><h2 className="font-medium text-zinc-950">In-person verification history</h2></div>
        <LiveVerificationList initialItems={history.map((item) => {
          const attributes = normalizedVerificationAttributes(item.attributes);
          return {
            id: item.id,
            branchId: item.branchId,
            verificationRequestId: item.verificationRequestId,
            checkoutId: item.checkoutId,
            servicePointName: item.servicePointName,
            status: item.status,
            isVerified: item.isVerified,
            failureCode: item.failureCode,
            failureReason: vendorVerificationFailureReason(item.failureCode),
            attributes,
            student: summarizeVerificationStudent(attributes),
            createdAt: item.createdAt.toISOString(),
            completedAt: item.completedAt?.toISOString() ?? null,
            latestDeliveryStatus: item.deliveries[0]?.status ?? null,
          };
        })} branchId={branch.id} liveCursor={encodeLiveVerificationCursor({ completedAt: new Date().toISOString(), id: "_" })} />
      </section>
    </div>
  );
}
