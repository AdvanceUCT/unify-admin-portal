"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import type { AccessActionResult, BankOption, PayoutAccount } from "@/lib/payments/paymentAccessSummary";
import { accessInput, accessButton } from "./styles";
export type PayoutEditorActions = { saveAccount: (state: AccessActionResult, data: FormData) => Promise<AccessActionResult>; loadBanks: () => Promise<{ banks?: BankOption[]; error?: string }> };
export function AccountSummary({ account }: { account: PayoutAccount | null }) {
  return account ? <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-fg-muted">Account holder</dt><dd className="font-medium text-fg">{account.accountHolderName || "Saved account"}</dd></div><div><dt className="text-fg-muted">Bank account</dt><dd className="font-medium text-fg">{account.bankName || "Saved bank"} · {account.accountMask || "Account saved"}</dd></div></dl> : <p className="text-sm text-fg-muted">No payout account saved.</p>;
}
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
  return <div className="space-y-4">
    <AccountSummary account={result.account ?? account} />
    <div ref={feedback} tabIndex={-1} role={result.error ? "alert" : "status"} className={result.error ? "text-sm text-danger-fg" : "text-sm text-success-fg"}>{result.error || result.message}</div>
    {result.uncertain ? <button type="button" className={accessButton} onClick={() => window.location.reload()}>Reload saved account</button> : <>
      {account && <button type="button" className="min-h-11 text-sm font-medium text-brand-700 underline" aria-expanded={editing} onClick={() => { setEditing(!editing); onStateChange?.(!editing); }}>{editing ? "Cancel account edit" : "Change payout account"}</button>}
      {editing && <form ref={form} action={action} onSubmit={() => onStateChange?.(true)} className="max-w-xl space-y-4 border-l-2 border-brand-200 pl-4" aria-label="Payout account">
        <p className="text-sm text-fg-muted">This account receives payouts for all your branches.</p>
        <label className="grid gap-1 text-sm font-medium">Account holder name<input className={accessInput} name="accountHolderName" defaultValue={account?.accountHolderName ?? ""} required maxLength={200} aria-invalid={Boolean(result.fieldErrors?.accountHolderName)} aria-describedby="holder-error" /></label>
        <p id="holder-error" className="text-sm text-danger-fg">{result.fieldErrors?.accountHolderName}</p>
        <label className="grid gap-1 text-sm font-medium">Search banks<input className={accessInput} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find your bank" /></label>
        <label className="grid gap-1 text-sm font-medium">Bank<select aria-label="Bank" className={accessInput} name="bankCode" required value={selectedBank} onChange={event => setSelectedBank(event.target.value)} aria-invalid={Boolean(result.fieldErrors?.bankCode)} aria-describedby="bank-error"><option value="">{banks.length ? "Choose a bank" : "Loading banks…"}</option>{shown.map(bank => <option key={bank.code} value={bank.code}>{bank.name}</option>)}</select></label>
        <p id="bank-error" role="status" className="text-sm text-danger-fg">{bankError || result.fieldErrors?.bankCode}</p>
        {bankError && <button type="button" className="min-h-11 text-sm underline" disabled={loading} onClick={fetchBanks}>{loading ? "Loading…" : "Retry bank list"}</button>}
        <label className="grid gap-1 text-sm font-medium">Account number<input className={accessInput} name="accountNumber" autoComplete="off" inputMode="numeric" required aria-invalid={Boolean(result.fieldErrors?.accountNumber)} aria-describedby="number-error" /></label>
        <p id="number-error" className="text-sm text-danger-fg">{result.fieldErrors?.accountNumber}</p>
        <button className={accessButton} disabled={pending || !banks.length || Boolean(bankError)} type="submit">{pending ? "Saving account…" : "Save account"}</button>
      </form>}
    </>}
  </div>;
}
