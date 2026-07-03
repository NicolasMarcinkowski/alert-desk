import { FreshnessBadge, type Freshness } from "./FreshnessBadge";

/**
 * Tuile KPI. `value`/`sub` en mono tabulaire ; les tons gain/loss sont
 * réservés aux valeurs de P&L conformément à la DA.
 */
export function KpiTile({
  label,
  value,
  sub,
  tone = "neutral",
  freshness,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "gain" | "loss" | "neutral";
  freshness?: Freshness;
}) {
  const toneClass =
    tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : "text-ink";

  return (
    <div className="rounded-xl border border-edge bg-surface px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-ink-mute">
          {label}
        </p>
        {freshness && <FreshnessBadge kind={freshness} />}
      </div>
      <p className={`mt-1.5 font-mono text-xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-ink-mute">{sub}</p>}
    </div>
  );
}
