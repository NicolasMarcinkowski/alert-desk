export function PageTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-5">
      <h1 className="text-lg font-bold">{title}</h1>
      {subtitle && <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>}
    </div>
  );
}

