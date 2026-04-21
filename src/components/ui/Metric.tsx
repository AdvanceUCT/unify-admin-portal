export function Metric({ detail, label, value }: { detail: string; label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <p className="text-sm font-medium text-zinc-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-normal text-zinc-950">{value}</p>
      <p className="mt-1 text-sm text-zinc-500">{detail}</p>
    </div>
  );
}
