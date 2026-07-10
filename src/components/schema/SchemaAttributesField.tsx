"use client";

import { X } from "lucide-react";
import { useMemo, useState } from "react";

const IDENTIFIER_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*$/;

export const DEFAULT_SCHEMA_ATTRIBUTES = [
  "studentNumber",
  "firstName",
  "lastName",
  "faculty",
  "year",
];

const SUGGESTED_SCHEMA_ATTRIBUTES = [
  "email",
  "phoneNumber",
  "dateOfBirth",
  "program",
  "campus",
  "enrollmentDate",
  "graduationDate",
  "studentType",
  "nationalId",
  "photoUrl",
];

/**
 * Every schema is required to carry the default student-identity fields, so
 * they're rendered as locked checkboxes rather than left for the admin to
 * retype. Suggested fields and free-form custom fields build on top of that.
 */
export function SchemaAttributesField({
  name = "attributes",
  initialAttributes = DEFAULT_SCHEMA_ATTRIBUTES,
}: {
  name?: string;
  initialAttributes?: string[];
}) {
  const [selectedOptional, setSelectedOptional] = useState<Set<string>>(
    () =>
      new Set(
        initialAttributes.filter((attr) =>
          SUGGESTED_SCHEMA_ATTRIBUTES.includes(attr),
        ),
      ),
  );
  const [customAttributes, setCustomAttributes] = useState<string[]>(() =>
    initialAttributes.filter(
      (attr) =>
        !DEFAULT_SCHEMA_ATTRIBUTES.includes(attr) &&
        !SUGGESTED_SCHEMA_ATTRIBUTES.includes(attr),
    ),
  );
  const [customInput, setCustomInput] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);

  const attributes = useMemo(
    () => [
      ...DEFAULT_SCHEMA_ATTRIBUTES,
      ...SUGGESTED_SCHEMA_ATTRIBUTES.filter((attr) =>
        selectedOptional.has(attr),
      ),
      ...customAttributes,
    ],
    [selectedOptional, customAttributes],
  );

  function toggleOptional(attr: string) {
    setSelectedOptional((prev) => {
      const next = new Set(prev);
      if (next.has(attr)) {
        next.delete(attr);
      } else {
        next.add(attr);
      }
      return next;
    });
  }

  function addCustomAttribute() {
    const trimmed = customInput.trim();
    if (!trimmed) {
      return;
    }
    if (!IDENTIFIER_PATTERN.test(trimmed)) {
      setCustomError(
        "Must start with a letter and contain only letters and numbers",
      );
      return;
    }
    if (attributes.some((attr) => attr.toLowerCase() === trimmed.toLowerCase())) {
      setCustomError("That field is already on this schema");
      return;
    }
    setCustomAttributes((prev) => [...prev, trimmed]);
    setCustomInput("");
    setCustomError(null);
  }

  function removeCustomAttribute(attr: string) {
    setCustomAttributes((prev) => prev.filter((existing) => existing !== attr));
  }

  return (
    <div className="space-y-4">
      <input name={name} type="hidden" value={attributes.join("\n")} />

      <div>
        <span className="text-sm font-medium text-zinc-700">
          Required fields
        </span>
        <p className="mt-0.5 text-xs text-zinc-500">
          Captured on every credential, on every schema.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {DEFAULT_SCHEMA_ATTRIBUTES.map((attr) => (
            <label
              key={attr}
              className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600"
            >
              <input
                checked
                className="rounded border-zinc-300"
                disabled
                type="checkbox"
              />
              {attr}
            </label>
          ))}
        </div>
      </div>

      <div>
        <span className="text-sm font-medium text-zinc-700">
          Suggested fields
        </span>
        <p className="mt-0.5 text-xs text-zinc-500">
          Check any additional fields this schema should capture.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {SUGGESTED_SCHEMA_ATTRIBUTES.map((attr) => (
            <label
              key={attr}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              <input
                checked={selectedOptional.has(attr)}
                className="rounded border-zinc-300"
                onChange={() => toggleOptional(attr)}
                type="checkbox"
              />
              {attr}
            </label>
          ))}
        </div>
      </div>

      <div>
        <span className="text-sm font-medium text-zinc-700">
          Custom fields
        </span>
        <p className="mt-0.5 text-xs text-zinc-500">
          Add anything specific to your institution.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            className="h-9 flex-1 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
            onChange={(event) => {
              setCustomInput(event.target.value);
              setCustomError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCustomAttribute();
              }
            }}
            placeholder="e.g. dormitory"
            type="text"
            value={customInput}
          />
          <button
            className="h-9 shrink-0 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            onClick={addCustomAttribute}
            type="button"
          >
            Add
          </button>
        </div>
        {customError ? (
          <p className="mt-1 text-xs text-rose-700">{customError}</p>
        ) : null}
        {customAttributes.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {customAttributes.map((attr) => (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700"
                key={attr}
              >
                {attr}
                <button
                  aria-label={`Remove ${attr}`}
                  className="text-zinc-400 hover:text-zinc-700"
                  onClick={() => removeCustomAttribute(attr)}
                  type="button"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
