import { cn } from "@/lib/cn";
import { PayoutAccountEditor } from "./payment-access/PayoutAccountEditor";
import { getPayoutBanksAction, savePaymentAccessPayoutAction } from "@/app/vendor/(portal)/payments/access/actions";
export function PayoutDestinationCard(props: {
  action: (data: FormData) => void | Promise<void>; className?: string;
  destinationSummary?: { accountHolderName?: string | null; accountMask?: string | null; bankCode?: string | null; bankName?: string | null; provider?: string | null; providerAccountName?: string | null; reference?: string | null } | null;
  hasDestination: boolean; payout?: string; payoutError?: string; returnTo: string;
}) {
  const value = props.destinationSummary;
  const account = props.hasDestination && value?.reference && value.provider ? { reference: value.reference, provider: value.provider, accountHolderName: value.accountHolderName ?? value.providerAccountName ?? null, accountMask: value.accountMask ?? null, bankCode: value.bankCode ?? null, bankName: value.bankName ?? null } : null;
  return <section className={cn("space-y-4 border-t border-border pt-5", props.className)}><h2 className="text-section-title">Payout account</h2><PayoutAccountEditor key={account?.reference ?? "new"} account={account} saveAccount={savePaymentAccessPayoutAction} loadBanks={getPayoutBanksAction} /></section>;
}
