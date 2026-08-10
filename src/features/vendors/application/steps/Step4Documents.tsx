"use client";

import { useState } from "react";
import {
  deleteDocumentAction,
  getDocumentViewUrlAction,
  uploadDocumentAction,
} from "@/app/vendor/(portal)/application/actions";
import { Dialog } from "@/components/ui/Dialog";
import type { DraftApplicationData } from "../VendorApplicationWizard";

type UploadStatus = "idle" | "uploading" | "done" | "error" | "removing";

const DOCUMENT_FIELDS: {
  key: keyof Pick<
    DraftApplicationData,
    | "docRegistrationCertificate"
    | "docProofOfAddress"
    | "docRepresentativeId"
    | "docLetterOfAuthorisation"
    | "docTaxCompliance"
    | "docBusinessLicence"
  >;
  label: string;
  required: boolean;
  hint: string;
}[] = [
  {
    key: "docRegistrationCertificate",
    label: "Company registration certificate",
    required: true,
    hint: "Official certificate from your company registry.",
  },
  {
    key: "docProofOfAddress",
    label: "Proof of business address",
    required: true,
    hint: "Utility bill, bank statement, or lease agreement (not older than 3 months).",
  },
  {
    key: "docRepresentativeId",
    label: "Representative identity document",
    required: true,
    hint: "Passport, national ID, or driver's licence of the authorised representative.",
  },
  {
    key: "docLetterOfAuthorisation",
    label: "Letter of authorisation",
    required: true,
    hint: "Signed letter authorising the representative to submit this application.",
  },
  {
    key: "docTaxCompliance",
    label: "Tax compliance certificate",
    required: false,
    hint: "Valid tax clearance or good standing certificate (optional).",
  },
  {
    key: "docBusinessLicence",
    label: "Business licence",
    required: false,
    hint: "Current operating licence or permit (optional).",
  },
];

export function Step4Documents({
  applicationId,
  initialData,
  initialFilenames,
  onComplete,
  onBack,
}: {
  applicationId: string;
  initialData: DraftApplicationData;
  initialFilenames?: Record<string, string>;
  onComplete: () => void;
  onBack: () => void;
}) {
  const [statuses, setStatuses] = useState<Record<string, UploadStatus>>(() => {
    const initial: Record<string, UploadStatus> = {};
    for (const field of DOCUMENT_FIELDS) {
      initial[field.key] = initialData[field.key] ? "done" : "idle";
    }
    return initial;
  });
  const [filenames, setFilenames] = useState<Record<string, string>>(() => initialFilenames ?? {});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [viewingKey, setViewingKey] = useState<string | null>(null);
  const [confirmRemoveKey, setConfirmRemoveKey] = useState<string | null>(null);
  const confirmRemoveField = DOCUMENT_FIELDS.find((field) => field.key === confirmRemoveKey);

  const requiredDone = DOCUMENT_FIELDS.filter((f) => f.required).every(
    (f) => statuses[f.key] === "done",
  );

  async function handleView(fieldKey: string) {
    setViewingKey(fieldKey);
    setErrors((prev) => ({ ...prev, [fieldKey]: "" }));

    // Open the tab synchronously so the browser doesn't block it as a popup,
    // then redirect it once the signed URL comes back.
    const tab = window.open("", "_blank");

    try {
      const result = await getDocumentViewUrlAction(applicationId, fieldKey);

      if (result.ok && result.url) {
        if (tab) tab.location.href = result.url;
      } else {
        tab?.close();
        setErrors((prev) => ({
          ...prev,
          [fieldKey]: result.error ?? "Could not open the file. Please try again.",
        }));
      }
    } catch {
      tab?.close();
      setErrors((prev) => ({
        ...prev,
        [fieldKey]: "Something went wrong while opening the file. Please try again.",
      }));
    } finally {
      setViewingKey(null);
    }
  }

  async function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
    fieldKey: string,
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    setStatuses((prev) => ({ ...prev, [fieldKey]: "uploading" }));
    setErrors((prev) => ({ ...prev, [fieldKey]: "" }));

    const formData = new FormData();
    formData.append("applicationId", applicationId);
    formData.append("fieldKey", fieldKey);
    formData.append("file", file);

    try {
      const result = await uploadDocumentAction(formData);

      if (result.ok) {
        setStatuses((prev) => ({ ...prev, [fieldKey]: "done" }));
        setFilenames((prev) => ({ ...prev, [fieldKey]: result.filename ?? file.name }));
      } else {
        setStatuses((prev) => ({ ...prev, [fieldKey]: "error" }));
        setErrors((prev) => ({
          ...prev,
          [fieldKey]: result.error ?? "Upload failed. Please try again with a valid file.",
        }));
      }
    } catch {
      setStatuses((prev) => ({ ...prev, [fieldKey]: "error" }));
      setErrors((prev) => ({
        ...prev,
        [fieldKey]: "Something went wrong while uploading. Please try again.",
      }));
    }

    event.target.value = "";
  }

  async function handleRemove(fieldKey: string) {
    setConfirmRemoveKey(null);
    setStatuses((prev) => ({ ...prev, [fieldKey]: "removing" }));
    setErrors((prev) => ({ ...prev, [fieldKey]: "" }));

    const formData = new FormData();
    formData.append("applicationId", applicationId);
    formData.append("fieldKey", fieldKey);

    try {
      const result = await deleteDocumentAction(formData);

      if (result.ok) {
        setStatuses((prev) => ({ ...prev, [fieldKey]: "idle" }));
        setFilenames((prev) => {
          const next = { ...prev };
          delete next[fieldKey];
          return next;
        });
      } else {
        setStatuses((prev) => ({ ...prev, [fieldKey]: "done" }));
        setErrors((prev) => ({
          ...prev,
          [fieldKey]: result.error ?? "Could not remove the file. Please try again.",
        }));
      }
    } catch {
      setStatuses((prev) => ({ ...prev, [fieldKey]: "done" }));
      setErrors((prev) => ({
        ...prev,
        [fieldKey]: "Something went wrong while removing the file. Please try again.",
      }));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-section-title text-fg">Supporting documents</h2>
        <p className="mt-1 text-body text-fg-muted">
          Upload the required documents. Accepted formats: PDF, Word, Excel, JPEG, PNG (max 5 MB
          each).
        </p>
      </div>

      <div className="space-y-3">
        {DOCUMENT_FIELDS.map(({ key, label, required, hint }) => {
          const status = statuses[key];
          const filename = filenames[key];
          const fieldError = errors[key];

          return (
            <div key={key} className="rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-body font-medium text-fg">
                    {label}
                    {required && <span className="ml-1 text-danger-fg">*</span>}
                  </p>
                  <p className="mt-0.5 text-caption text-fg-subtle">{hint}</p>
                  {(status === "done" || status === "removing") && (
                    <p className="mt-1 text-caption">
                      {status === "removing" ? (
                        <span className="text-success-fg">Removing...</span>
                      ) : filename ? (
                        <>
                          <span className="text-fg-subtle">Uploaded: </span>
                          <button
                            className="font-medium text-success-fg underline decoration-success-border underline-offset-2 hover:decoration-success-fg disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={viewingKey === key}
                            onClick={() => handleView(key)}
                            type="button"
                          >
                            {viewingKey === key ? "Opening..." : filename}
                          </button>
                        </>
                      ) : (
                        <span className="text-success-fg">Uploaded</span>
                      )}
                    </p>
                  )}
                  {fieldError && (
                    <p className="mt-1 text-caption text-danger-fg">{fieldError}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <label
                    className={`inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-caption font-medium transition ${
                      status === "uploading" || status === "removing"
                        ? "cursor-not-allowed border-border bg-surface-muted text-fg-subtle"
                        : "border-info-border bg-info-bg text-info-fg hover:bg-info-border"
                    }`}
                  >
                    {status === "uploading"
                      ? "Uploading..."
                      : status === "done" || status === "removing"
                        ? "Replace"
                        : status === "error"
                          ? "Retry"
                          : "Upload"}
                    <input
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                      className="sr-only"
                      disabled={status === "uploading" || status === "removing"}
                      onChange={(e) => handleFileChange(e, key)}
                      type="file"
                    />
                  </label>
                  {(status === "done" || status === "removing") && (
                    <button
                      className="inline-flex h-9 items-center rounded-md border border-danger-border bg-danger-bg px-3 text-caption font-medium text-danger-fg transition hover:bg-danger-border disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={status === "removing"}
                      onClick={() => setConfirmRemoveKey(key)}
                      type="button"
                    >
                      {status === "removing" ? "Removing..." : "Remove"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between">
        <button
          className="h-11 rounded-md border border-border px-5 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted"
          onClick={onBack}
          type="button"
        >
          Back
        </button>
        <button
          className="h-11 rounded-md bg-brand-600 px-5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!requiredDone}
          onClick={onComplete}
          type="button"
        >
          Save and continue
        </button>
      </div>

      <Dialog isOpen={confirmRemoveKey !== null} onClose={() => setConfirmRemoveKey(null)} title="Remove document">
        <p className="text-sm text-fg-muted">
          Remove {confirmRemoveField?.label}? You&apos;ll need to upload it again before submitting.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="h-9 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
            onClick={() => setConfirmRemoveKey(null)}
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-9 rounded-md bg-danger-fg px-3 text-sm font-medium text-white transition hover:opacity-90"
            onClick={() => confirmRemoveKey && handleRemove(confirmRemoveKey)}
            type="button"
          >
            Remove document
          </button>
        </div>
      </Dialog>
    </div>
  );
}
