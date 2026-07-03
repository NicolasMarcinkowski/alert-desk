/**
 * Badge de fraîcheur des données — concept central de l'app :
 * chaque valeur de marché affiche honnêtement sa latence.
 */
export type Freshness = "live" | "delayed" | "eod";

const CONFIG: Record<Freshness, { label: string; className: string }> = {
  live: { label: "LIVE", className: "text-gain border-gain/30 bg-gain/10" },
  delayed: {
    label: "~15 MIN",
    className: "text-warn border-warn/30 bg-warn/10",
  },
  eod: {
    label: "EOD",
    className: "text-ink-soft border-edge bg-surface-2",
  },
};

export function FreshnessBadge({ kind }: { kind: Freshness }) {
  const { label, className } = CONFIG[kind];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[9px] font-semibold tracking-wider ${className}`}
    >
      {kind === "live" && (
        <span
          className="size-1 rounded-full bg-gain"
          style={{ animation: "pulse-dot 1.6s ease-in-out infinite" }}
        />
      )}
      {label}
    </span>
  );
}
