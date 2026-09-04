/**
 * @fileoverview Typeahead country pickers used by the organisation info step.
 * @module features/vendors/application/steps/CountryCombobox
 */

"use client";

import { useId, useState } from "react";
import { COUNTRIES } from "@/lib/vendors/countries";

const INPUT =
  "mt-2 h-11 w-full rounded-md border border-border px-3 text-body text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
const OPTION_LIST =
  "absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-surface py-1 shadow-lg";
const OPTION = "block w-full px-3 py-2 text-left text-body text-fg hover:bg-surface-muted";

function matchingCountries(query: string, exclude: readonly string[] = []) {
  const q = query.trim().toLowerCase();
  return COUNTRIES.filter(
    (country) => !exclude.includes(country) && (q === "" || country.toLowerCase().includes(q)),
  );
}

/** Single-select country typeahead: type to filter, click a suggestion to choose it. */
export function CountryCombobox({
  id,
  name,
  defaultValue,
  required,
}: {
  id: string;
  name: string;
  defaultValue: string;
  required?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const listId = useId();

  const matches = matchingCountries(value);

  return (
    <div className="relative">
      <input
        aria-controls={listId}
        aria-expanded={open}
        autoComplete="off"
        className={INPUT}
        id={id}
        name={name}
        onBlur={() => window.setTimeout(() => setOpen(false), 100)}
        onChange={(event) => {
          setValue(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Start typing a country..."
        required={required}
        role="combobox"
        type="text"
        value={value}
      />
      {open && matches.length > 0 && (
        <ul className={OPTION_LIST} id={listId}>
          {matches.map((country) => (
            <li key={country}>
              <button
                className={OPTION}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setValue(country);
                  setOpen(false);
                }}
                type="button"
              >
                {country}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Multi-select country typeahead: selections render as removable chips and post as repeated hidden inputs. */
export function CountryMultiSelect({
  name,
  defaultValue,
  onChange,
}: {
  name: string;
  defaultValue: string[];
  onChange: (values: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>(defaultValue);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const listId = useId();

  const matches = matchingCountries(query, selected);

  function addCountry(country: string) {
    const next = [...selected, country];
    setSelected(next);
    setQuery("");
    onChange(next);
  }

  function removeCountry(country: string) {
    const next = selected.filter((c) => c !== country);
    setSelected(next);
    onChange(next);
  }

  return (
    <div>
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {selected.map((country) => (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 py-1 pl-3 pr-2 text-caption font-medium text-brand-700"
              key={country}
            >
              {country}
              <button
                aria-label={`Remove ${country}`}
                className="text-brand-700 transition hover:text-brand-900"
                onClick={() => removeCountry(country)}
                type="button"
              >
                ×
              </button>
              <input name={name} type="hidden" value={country} />
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          aria-controls={listId}
          aria-expanded={open}
          autoComplete="off"
          className={INPUT}
          onBlur={() => window.setTimeout(() => setOpen(false), 100)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search and select countries..."
          role="combobox"
          type="text"
          value={query}
        />
        {open && matches.length > 0 && (
          <ul className={OPTION_LIST} id={listId}>
            {matches.map((country) => (
              <li key={country}>
                <button
                  className={OPTION}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    addCountry(country);
                  }}
                  type="button"
                >
                  {country}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
