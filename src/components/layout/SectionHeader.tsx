export function SectionHeader({ description, title }: { description?: string; title: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-normal text-zinc-950">{title}</h1>
      {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">{description}</p> : null}
    </div>
  );
}
