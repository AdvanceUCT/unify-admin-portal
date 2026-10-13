/**
 * @fileoverview Renders the public funding form at `/fund`, where anyone can pay into a student's wallet.
 * @module app/(public)/fund/page
 */

import { randomUUID } from "node:crypto";

import { env } from "@/lib/config/env";
import { formatMoneyMinor } from "@/lib/formatters";
import { getUniversityProfileForRender } from "@/lib/university/profile";

import { startFunderTopupAction } from "./actions";
import { fundErrorMessage } from "./fundErrors";
import { FundShell } from "./FundShell";
import { FundSubmitButton } from "./FundSubmitButton";

const inputClassName =
  "mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function minorToRandInput(amountMinor: number) {
  return (amountMinor / 100).toFixed(2);
}

function Field({
  className,
  hint,
  label,
  ...inputProps
}: React.InputHTMLAttributes<HTMLInputElement> & { hint?: string; label: string; name: string }) {
  const id = `fund-${inputProps.name}`;
  return (
    <div>
      <label className="block text-sm font-medium text-fg" htmlFor={id}>
        {label}
      </label>
      <input className={className ? `${inputClassName} ${className}` : inputClassName} id={id} required {...inputProps} />
      {hint ? <p className="mt-1.5 text-xs text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

export default async function FundStudentPage({
  searchParams,
}: {
  searchParams: Promise<{ fundError?: string | string[] }>;
}) {
  const [profile, params] = await Promise.all([getUniversityProfileForRender(), searchParams]);
  const fundError = fundErrorMessage(firstParam(params.fundError));
  const available = env.PAYMENT_WALLET_TOPUPS_ENABLED && Boolean(profile?.paymentWalletEnabled);
  const minMinor = env.PAYMENT_TOPUP_MIN_MINOR;
  const maxMinor = env.PAYMENT_TOPUP_MAX_MINOR;

  return (
    <FundShell profile={profile} width="wide">
      <section className="rounded-xl border border-border bg-surface p-6 shadow-md">
        <h1 className="text-page-title text-fg">Fund a student</h1>
        <p className="mt-2 text-sm leading-6 text-fg-muted">
          Send funds to a student&apos;s UNIFY wallet. Funds can only be spent at approved campus vendors.
        </p>

        {!available ? (
          <p className="mt-5 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-fg-muted">
            Funding is currently unavailable.
          </p>
        ) : (
          <form action={startFunderTopupAction} className="mt-6 space-y-5">
            <input name="idempotencyKey" type="hidden" value={randomUUID()} />
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Shown in caps; the server upper-cases it too, as student activation does. */}
              <Field
                autoCapitalize="characters"
                autoComplete="off"
                className="uppercase"
                label="Student number"
                maxLength={64}
                name="studentNumber"
                spellCheck={false}
              />
              <Field autoComplete="off" label="Student surname" maxLength={100} name="studentSurname" />
              <Field
                autoComplete="name"
                hint="Shown to the student in their wallet activity."
                label="Your name"
                maxLength={60}
                minLength={2}
                name="funderName"
              />
              <Field
                autoComplete="email"
                hint="Paystack sends your receipt here."
                label="Your email"
                maxLength={254}
                name="funderEmail"
                type="email"
              />
              <Field
                hint={`Between ${formatMoneyMinor(minMinor)} and ${formatMoneyMinor(maxMinor)}.`}
                inputMode="decimal"
                label="Amount (R)"
                max={minorToRandInput(maxMinor)}
                min={minorToRandInput(minMinor)}
                name="amount"
                step="0.01"
                type="number"
              />
            </div>

            {fundError ? (
              <p className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg" role="alert">
                {fundError}
              </p>
            ) : null}

            <div className="space-y-2">
              <FundSubmitButton />
              <p className="text-center text-xs text-fg-subtle">You will pay on Paystack&apos;s secure checkout.</p>
            </div>
          </form>
        )}
      </section>
    </FundShell>
  );
}
