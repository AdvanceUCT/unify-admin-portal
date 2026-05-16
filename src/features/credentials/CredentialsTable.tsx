"use client";

import { Badge } from "@/components/ui/Badge";
import { useAdminState } from "@/lib/api/useAdminState";
import type { ActivationDeliveryStatus, AdminState } from "@/lib/api/types";
import {
  credentialStatusTone,
  formatActivationDeliveryStatus,
  formatCredentialStatus,
  formatDateTime,
} from "@/lib/formatters";

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

export function CredentialsTable({ initialState }: { initialState: AdminState }) {
  const { error, state } = useAdminState({ initialState });
  const currentState = state ?? initialState;
  const deliveriesByCredentialId = new Map(
    currentState.activationDeliveries.map((delivery) => [delivery.credentialId, delivery]),
  );

  return (
    <section className="rounded-lg border border-zinc-200 bg-white">
      {error ? <p className="border-b border-zinc-200 px-5 py-3 text-sm text-amber-700">{error}</p> : null}
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
            {currentState.credentials.map((credential) => {
              const activationDelivery = deliveriesByCredentialId.get(credential.id);

              return (
                <tr key={credential.id}>
                  <td className="px-5 py-4">
                    <p className="font-medium text-zinc-950">{credential.holderName}</p>
                    <p className="text-xs text-zinc-500">{credential.studentNumber}</p>
                  </td>
                  <td className="px-5 py-4">
                    <Badge tone={credentialStatusTone(credential.lifecycleState)}>
                      {formatCredentialStatus(credential.lifecycleState)}
                    </Badge>
                  </td>
                  <td className="px-5 py-4">
                    {activationDelivery ? (
                      <>
                        <Badge tone={deliveryTone(activationDelivery.status)}>
                          {formatActivationDeliveryStatus(activationDelivery.status)}
                        </Badge>
                        {activationDelivery.activatedAt ? (
                          <p className="mt-2 text-xs text-zinc-500">
                            Activated {formatDateTime(activationDelivery.activatedAt)}
                          </p>
                        ) : null}
                      </>
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
  );
}
