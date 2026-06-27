"use client";

export function RevokeButton({
  action,
  applicationId,
  companyName,
}: {
  action: (formData: FormData) => void;
  applicationId: string;
  companyName: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Revoke access for ${companyName}? This will remove them from active vendors.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="applicationId" value={applicationId} />
      <button
        className="h-8 rounded-md border border-rose-200 bg-rose-50 px-3 text-xs font-medium text-rose-700 hover:bg-rose-100"
        type="submit"
      >
        Revoke access
      </button>
    </form>
  );
}
