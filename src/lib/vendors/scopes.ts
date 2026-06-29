export const VENDOR_VERIFICATION_SCOPES = [
  "studentNumber",
  "faculty",
  "year",
] as const;

export type VendorVerificationScope =
  (typeof VENDOR_VERIFICATION_SCOPES)[number];

export const VENDOR_VERIFICATION_SCOPE_OPTIONS = [
  { value: "studentNumber", label: "Student number" },
  { value: "faculty", label: "Faculty" },
  { value: "year", label: "Year of study" },
] satisfies readonly {
  value: VendorVerificationScope;
  label: string;
}[];
