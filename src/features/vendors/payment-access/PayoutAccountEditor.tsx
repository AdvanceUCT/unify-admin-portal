"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import type { AccessActionResult, BankOption, PayoutAccount } from "@/lib/payments/paymentAccessSummary";
import { accessButton, accessInput, accessLabel, accessSecondaryButton } from "./styles";
export type PayoutEditorActions = { saveAccount: (state: AccessActionResult, data: FormData) => Promise<AccessActionResult>; loadBanks: () => Promise<{ banks?: BankOption[]; error?: string }> };
export function AccountSummary({ account }: { account: PayoutAccount | null }) {
  return account ? (
    <dl className="grid gap-3 rounded-lg border border-border bg-surface-muted p-3 text-sm sm:grid-cols-2">
      <div><dt className="text-fg-subtle">Account holder</dt><dd className="font-medium text-fg">{account.accountHolderName || "Saved account"}</dd></div>
      <div><dt className="text-fg-subtle">Bank account</dt><dd className="font-medium text-fg">{account.bankName || "Saved bank"} · {account.accountMask || "Account saved"}</dd></div>
    </dl>
  ) : <p className="text-sm text-fg-muted">No payout account saved.</p>;
}
/**
 * Keep unsaved bank details in the form and reset them only after an acknowledged saved account.
 * An uncertain save requires reloading server state; it must not be automatically repeated or treated as submission approval.
 */
export function PayoutAccountEditor({ account, saveAccount, loadBanks, onSaved, onStateChange }: PayoutEditorActions & { account: PayoutAccount | null; onSaved?: (account: PayoutAccount) => void; onStateChange?: (blocked: boolean) => void }) {
  const [editing, setEditing] = useState(!account);
  const [banks, setBanks] = useState<BankOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [bankError, setBankError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedBank, setSelectedBank] = useState(account?.bankCode ?? "");
  const form = useRef<HTMLFormElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const [result, action, pending] = useActionState(async (state: AccessActionResult, data: FormData) => {
    try {
      const saved = await saveAccount(state, data);
      if (saved.account) { form.current?.reset(); setEditing(false); onSaved?.(saved.account); onStateChange?.(false); }
      return saved;
    } catch { return { uncertain: true, error: "The save could not be confirmed. Reload to check the saved account." }; }
  }, {});
  /**
   * Reload supported bank choices without resubmitting payout details.
   * Expose service failure inline and keep the editor available for retry.
   */
  async function fetchBanks() {
    setLoading(true); setBankError("");
    try { const result = await loadBanks(); setBanks(result.banks ?? []); setBankError(result.error ?? ""); }
    catch { setBankError("Banks could not be loaded. Try again."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    if (!editing) return;
    let active = true;
    void loadBanks().then(result => { if (active) { setBanks(result.banks ?? []); setBankError(result.error ?? ""); } }).catch(() => { if (active) setBankError("Banks could not be loaded. Try again."); });
    return () => { active = false; };
  }, [editing, loadBanks]);
  useEffect(() => {
    if (result.error || result.message) feedback.current?.focus();
  }, [result]);
  const shown = banks.filter(bank => bank.code === selectedBank || bank.name.toLowerCase().includes(search.toLowerCase()));
  const bankMessage = bankError || result.fieldErrors?.bankCode;
  return <div className="space-y-4">
    <AccountSummary account={result.account ?? account} />
    <div ref={feedback} tabIndex={-1} role={result.error ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm empty:hidden ${result.error ? "border-danger-border bg-danger-bg text-danger-fg" : "border-success-border bg-success-bg text-success-fg"}`}>{result.error || result.message}</div>
    {result.uncertain ? <button type="button" className={accessButton} onClick={() => window.location.reload()}>Reload saved account</button> : <>
      {account && <button type="button" className={accessSecondaryButton} aria-expanded={editing} onClick={() => { setEditing(!editing); onStateChange?.(!editing); }}>{editing ? "Cancel account edit" : "Change payout account"}</button>}
      {editing && <form ref={form} action={action} onSubmit={() => onStateChange?.(true)} className="max-w-xl space-y-4 rounded-lg border border-border p-4" aria-label="Payout account">
        <p className="text-sm text-fg-subtle">This account receives payouts for all your branches.</p>
        <div className="space-y-1">
          <label className={accessLabel}>Account holder name<input className={accessInput} name="accountHolderName" defaultValue={account?.accountHolderName ?? ""} required maxLength={200} aria-invalid={Boolean(result.fieldErrors?.accountHolderName)} aria-describedby="holder-error" /></label>
          <p id="holder-error" className="text-xs text-danger-fg empty:hidden">{result.fieldErrors?.accountHolderName}</p>
        </div>
        <label className={accessLabel}>Search banks<input className={accessInput} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find your bank" /></label>
        <div className="space-y-1">
          <label className={accessLabel}>Bank<select aria-label="Bank" className={accessInput} name="bankCode" required value={selectedBank} onChange={event => setSelectedBank(event.target.value)} aria-invalid={Boolean(result.fieldErrors?.bankCode)} aria-describedby="bank-error"><option value="">{banks.length ? "Choose a bank" : "Loading banks…"}</option>{shown.map(bank => <option key={bank.code} value={bank.code}>{bank.name}</option>)}</select></label>
          <p id="bank-error" role="status" className="text-xs text-danger-fg empty:hidden">{bankMessage}</p>
        </div>
        {bankError && <button type="button" className={accessSecondaryButton} disabled={loading} onClick={fetchBanks}>{loading ? "Loading…" : "Retry bank list"}</button>}
        <div className="space-y-1">
          <label className={accessLabel}>Account number<input className={accessInput} name="accountNumber" autoComplete="off" inputMode="numeric" required aria-invalid={Boolean(result.fieldErrors?.accountNumber)} aria-describedby="number-error" /></label>
          <p id="number-error" className="text-xs text-danger-fg empty:hidden">{result.fieldErrors?.accountNumber}</p>
        </div>
        <button className={accessButton} disabled={pending || !banks.length || Boolean(bankError)} type="submit">{pending ? "Saving account…" : "Save account"}</button>
      </form>}
    </>}
  </div>;
}
