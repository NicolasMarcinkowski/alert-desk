import { Card } from "./Card";

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

export function PagePlaceholder({
  title,
  subtitle,
  milestone,
  description,
}: {
  title: string;
  subtitle?: string;
  milestone: string;
  description: string;
}) {
  return (
    <div>
      <PageTitle title={title} subtitle={subtitle} />
      <Card>
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <span className="rounded border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-accent">
            {milestone}
          </span>
          <p className="max-w-md text-sm text-ink-soft">{description}</p>
        </div>
      </Card>
    </div>
  );
}
