export function SectionHeader({ description, title }: { description?: string; title: string }) {
  return (
    <div>
      <h2 className="text-page-title tracking-tight text-fg">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-3xl text-body leading-6 text-fg-muted">{description}</p>
      ) : null}
    </div>
  );
}
