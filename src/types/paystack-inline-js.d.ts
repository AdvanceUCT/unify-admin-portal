/**
 * @fileoverview Minimal ambient types for `@paystack/inline-js` — the package ships no `.d.ts`.
 * Shape confirmed against the published README for v2.25.0 (resumeTransaction's
 * access-code parameter and onSuccess/onError/onCancel/onLoad callback shapes).
 */
declare module "@paystack/inline-js" {
  export type PaystackPopSuccessEvent = { id: number; reference: string; message: string };
  export type PaystackPopErrorEvent = { message: string };
  export type PaystackPopLoadEvent = { id: number; customer: unknown; accessCode: string };

  export type PaystackPopResumeCallbacks = {
    onSuccess?: (event: PaystackPopSuccessEvent) => void;
    onError?: (event: PaystackPopErrorEvent) => void;
    onCancel?: () => void;
    onLoad?: (event: PaystackPopLoadEvent) => void;
  };

  export default class PaystackPop {
    resumeTransaction(accessCode: string, callbacks: PaystackPopResumeCallbacks): unknown;
  }
}
