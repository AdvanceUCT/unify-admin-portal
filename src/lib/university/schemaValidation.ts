import { z } from "zod";

const IDENTIFIER_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*$/;

export const schemaNameSchema = z
  .string()
  .trim()
  .min(1, "Schema name is required")
  .max(100, "Schema name must be 100 characters or fewer")
  .regex(
    IDENTIFIER_PATTERN,
    "Schema name must start with a letter and contain only letters and numbers",
  );

// The ledger requires a dotted, numeric version made of 2 or 3 parts
// (e.g. "1.0" or "1.0.1") — anything else fails schema registration.
const VERSION_PATTERN = /^\d+\.\d+(\.\d+)?$/;

export const schemaVersionSchema = z
  .string()
  .trim()
  .min(1, "Version is required")
  .max(20, "Version must be 20 characters or fewer")
  .regex(
    VERSION_PATTERN,
    "Version must be numeric with 2 or 3 dot-separated parts, e.g. 1.0 or 1.0.1",
  );

/**
 * Parses a newline-separated attributes textarea value into a validated,
 * deduplicated list of attribute names.
 */
export const schemaAttributesSchema = z
  .string()
  .trim()
  .min(1, "At least one attribute is required")
  .transform((value) =>
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  )
  .refine((attrs) => attrs.length > 0, {
    message: "At least one attribute is required",
  })
  .refine((attrs) => attrs.every((attr) => IDENTIFIER_PATTERN.test(attr)), {
    message:
      "Attributes must start with a letter and contain only letters and numbers",
  })
  .refine((attrs) => new Set(attrs).size === attrs.length, {
    message: "Attributes must be unique",
  });
