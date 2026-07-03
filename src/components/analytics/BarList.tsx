import { formatSignedMoney } from "@/lib/utils/format";

/** Barres horizontales de P&L net par catégorie (échelle sur max |P&L|). */
export function BarList({
  items,
  currency,
}: {
  items: { label: string; pnl: number; count: number }[];
  currency: string;
}) {
  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-ink-mute">
        Aucun trade clôturé sur la période.
      </p>
    );
  }
  const maxAbs = Math.max(...items.map((i) => Math.abs(i.pnl)), 1);

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-3 text-sm">
          <span className="w-28 shrink-0 truncate font-mono text-[13px]">
            {item.label}
          </span>
          <div className="h-4 flex-1 rounded-sm bg-surface-2">
            <div
              className={`h-full rounded-sm ${item.pnl >= 0 ? "bg-gain/60" : "bg-loss/60"}`}
              style={{ width: `${(Math.abs(item.pnl) / maxAbs) * 100}%` }}
            />
          </div>
          <span
            className={`w-28 shrink-0 text-right font-mono text-[13px] tabular-nums ${
              item.pnl >= 0 ? "text-gain" : "text-loss"
            }`}
          >
            {formatSignedMoney(item.pnl, currency)}
          </span>
          <span className="w-16 shrink-0 text-right text-xs text-ink-mute">
            {item.count} trade{item.count > 1 ? "s" : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
