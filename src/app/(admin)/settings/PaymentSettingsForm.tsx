/**
 * @fileoverview Owns the payment-services enablement, contacts, and Paystack key forms.
 * @module app/(admin)/settings/PaymentSettingsForm
 */

"use client";

import { useActionState } from "react";

import {
  enablePaymentServicesAction,
  savePaymentContactsAction,
  savePaystackKeyAction,
  type PaymentSettingsActionState,
} from "./actions";

const initialState: PaymentSettingsActionState = { status: "idle" };

function FeedbackMessage({ state }: { state: PaymentSettingsActionState }) {
  if (!state.message) return null;
  return (
    <p
      aria-live="polite"
      className={
        state.status === "error"
          ? "rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg"
          : "rounded-md border border-success-border bg-success-bg px-3 py-2 text-sm text-success-fg"
      }
    >
      {state.message}
    </p>
  );
}

export function PaymentServicesEnableForm({ enabled }: { enabled: boolean }) {
  const [state, formAction, isPending] = useActionState(
    async () => enablePaymentServicesAction(),
    initialState,
  );

  if (enabled) {
    return (
      <p className="text-sm text-fg-muted">
        Payment services are <span className="font-medium text-success-fg">enabled</span> for this
        university.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm text-fg-subtle">
        Enable payment services once contacts and a validated Paystack key are set up.
      </p>
      <FeedbackMessage state={state} />
      <button
        className="h-10 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Enabling..." : "Enable payment services"}
      </button>
    </form>
  );
}

export function PaymentContactsForm({
  financeContactName,
  financeContactEmail,
  technicalContactName,
  technicalContactEmail,
  payoutCadence,
}: {
  financeContactName: string;
  financeContactEmail: string;
  technicalContactName: string;
  technicalContactEmail: string;
  payoutCadence: string;
}) {
  const [state, formAction, isPending] = useActionState(savePaymentContactsAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field defaultValue={financeContactName} label="Finance contact name" name="financeContactName" />
        <Field
          defaultValue={financeContactEmail}
          label="Finance contact email"
          name="financeContactEmail"
          type="email"
        />
        <Field
          defaultValue={technicalContactName}
          label="Technical contact name"
          name="technicalContactName"
        />
        <Field
          defaultValue={technicalContactEmail}
          label="Technical contact email"
          name="technicalContactEmail"
          type="email"
        />
        <label className="block text-sm">
          <span className="font-medium text-fg-muted">Payout cadence</span>
          <select
            className="mt-1.5 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            defaultValue={payoutCadence}
            name="payoutCadence"
          >
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
          </select>
        </label>
      </div>
      <FeedbackMessage state={state} />
      <div className="flex justify-end">
        <button
          className="h-10 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Saving..." : "Save contacts"}
        </button>
      </div>
    </form>
  );
}

export function PaystackKeyForm() {
  const [state, formAction, isPending] = useActionState(savePaystackKeyAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <label className="block text-sm">
        <span className="font-medium text-fg-muted">Paystack secret key</span>
        <input
          autoComplete="off"
          className="mt-1.5 h-10 w-full rounded-md border border-border px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          name="apiKey"
          placeholder="sk_test_... or sk_live_..."
          required
          type="password"
        />
      </label>
      <p className="text-xs text-fg-subtle">
        Validated against Paystack immediately (a harmless balance check) before it&apos;s saved.
        Test and live keys are stored separately based on the key&apos;s prefix.
      </p>
      <FeedbackMessage state={state} />
      <div className="flex justify-end">
        <button
          className="h-10 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Validating..." : "Validate & save key"}
        </button>
      </div>
    </form>
  );
}

function Field({
  defaultValue,
  label,
  name,
  type = "text",
}: {
  defaultValue: string;
  label: string;
  name: string;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-fg-muted">{label}</span>
      <input
        className="mt-1.5 h-10 w-full rounded-md border border-border px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        defaultValue={defaultValue}
        name={name}
        type={type}
      />
    </label>
  );
}
