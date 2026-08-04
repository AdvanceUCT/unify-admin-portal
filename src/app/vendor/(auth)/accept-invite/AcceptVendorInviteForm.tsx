"use client";

import { Eye, EyeOff } from "lucide-react";
import { useActionState, useState } from "react";

import { acceptVendorInviteAction, type AcceptVendorInviteState } from "./actions";

export function AcceptVendorInviteForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<AcceptVendorInviteState, FormData>(acceptVendorInviteAction, {});
  const [visible, setVisible] = useState(false);
  return <form action={action} className="mt-6 space-y-4">
    <input name="token" type="hidden" value={token} />
    <label className="block text-sm font-medium text-zinc-700">Password<div className="relative mt-2"><input autoComplete="new-password" className="h-11 w-full rounded-md border border-zinc-300 px-3 pr-11 text-sm" minLength={12} name="password" required type={visible ? "text" : "password"} /><button aria-label={visible ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-zinc-500" onClick={() => setVisible((value) => !value)} type="button">{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
    <label className="block text-sm font-medium text-zinc-700">Confirm password<input autoComplete="new-password" className="mt-2 h-11 w-full rounded-md border border-zinc-300 px-3 text-sm" minLength={12} name="confirmPassword" required type={visible ? "text" : "password"} /></label>
    {state.error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
    <button className="h-11 w-full rounded-md bg-zinc-950 px-4 text-sm font-medium text-white disabled:opacity-60" disabled={pending} type="submit">{pending ? "Creating account..." : "Create staff account"}</button>
  </form>;
}
