import type { ImportFieldDefinition } from "@/lib/imports/mapping";
import { rowKey, type ImportRowStatus, type PreviewRow } from "@/lib/imports/types";

/**
 * Renders one category's rows as a full data table (every mapped field as a
 * column), not just a name/student-number summary. Updated cells show
 * old -> new inline; Error/Missing rows get an extra Issues column. No
 * interactivity of its own — safe to render from a server or client parent.
 */
export function PreviewRowsTable({
  columns,
  rows,
  status,
}: {
  columns: ImportFieldDefinition[];
  rows: PreviewRow[];
  status: ImportRowStatus;
}) {
  const showIssuesColumn = status === "Error" || status === "Missing";

  return (
    <div className="overflow-x-auto rounded-md border border-zinc-200">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            {columns.map((column) => (
              <th className="whitespace-nowrap px-4 py-2 font-medium" key={column.name}>
                {column.label}
              </th>
            ))}
            {showIssuesColumn ? <th className="whitespace-nowrap px-4 py-2 font-medium">Issues</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => {
                const change = row.diff?.[column.name];
                const value = row.mappedData?.[column.name];

                return (
                  <td className="whitespace-nowrap px-4 py-2 text-zinc-700" key={column.name}>
                    {change ? (
                      <span>
                        <span className="text-zinc-400 line-through">{change.old ?? "(empty)"}</span>{" "}
                        <span className="font-medium text-zinc-900">&rarr; {change.new}</span>
                      </span>
                    ) : (
                      (value ?? <span className="text-zinc-300">—</span>)
                    )}
                  </td>
                );
              })}
              {showIssuesColumn ? (
                <td className="px-4 py-2 text-xs text-rose-700">
                  {row.errors && row.errors.length > 0 ? (
                    row.errors.join(" ")
                  ) : status === "Missing" ? (
                    <span className="text-zinc-500">Not present in the uploaded file.</span>
                  ) : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
