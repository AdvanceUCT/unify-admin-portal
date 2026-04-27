import { SectionHeader } from "@/components/layout/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { getActivationDeliveries, getCredentials } from "@/lib/api/client";
import type { ActivationDeliveryStatus } from "@/lib/api/types";
import { formatActivationDeliveryStatus, formatCredentialStatus, formatDateTime } from "@/lib/formatters";

function deliveryTone(status: ActivationDeliveryStatus) {
  switch (status) {
    case "Delivered":
      return "success";
    case "Failed":
      return "danger";
    case "Pending":
      return "warning";
  }
}

export default async function CredentialsPage() {
  const [credentials, activationDeliveries] = await Promise.all([getCredentials(), getActivationDeliveries()]);
  const deliveriesByCredentialId = new Map(
    activationDeliveries.map((delivery) => [delivery.credentialId, delivery]),
  );

  return (
    <div className="space-y-6">
      <SectionHeader title="Credentials" description="Student VC lifecycle records from the simulated cohort." />
      <section className="rounded-lg border border-zinc-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">Holder</th>
                <th className="px-5 py-3 font-medium">State</th>
                <th className="px-5 py-3 font-medium">Activation delivery</th>
                <th className="px-5 py-3 font-medium">Valid from</th>
                <th className="px-5 py-3 font-medium">Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {credentials.map((credential) => {
                const activationDelivery = deliveriesByCredentialId.get(credential.id);

                return (
                  <tr key={credential.id}>
                    <td className="px-5 py-4">
                      <p className="font-medium text-zinc-950">{credential.holderName}</p>
                      <p className="text-xs text-zinc-500">{credential.studentNumber}</p>
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={credential.lifecycleState === "Active" ? "success" : "neutral"}>
                        {formatCredentialStatus(credential.lifecycleState)}
                      </Badge>
                    </td>
                    <td className="px-5 py-4">
                      {activationDelivery ? (
                        <Badge tone={deliveryTone(activationDelivery.status)}>
                          {formatActivationDeliveryStatus(activationDelivery.status)}
                        </Badge>
                      ) : (
                        <span className="text-zinc-500">Not queued</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">{formatDateTime(credential.validFrom)}</td>
                    <td className="px-5 py-4 text-zinc-600">{formatDateTime(credential.expiresAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
