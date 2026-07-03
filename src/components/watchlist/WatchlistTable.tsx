"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { FreshnessBadge } from "@/components/ui/FreshnessBadge";
import {
  formatPrice,
  formatSignedMoney,
  formatSignedPct,
} from "@/lib/utils/format";

export interface WatchlistItemData {
  id: string;
  symbol: string;
  name: string | null;
  high52: number | null;
  low52: number | null;
}

function Range52({
  last,
  low,
  high,
}: {
  last: number | null;
  low: number | null;
  high: number | null;
}) {
  if (last === null || low === null || high === null || high <= low) {
    return <span className="text-ink-mute">—</span>;
  }
  const pct = Math.min(100, Math.max(0, ((last - low) / (high - low)) * 100));
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] tabular-nums text-ink-mute">
        {low.toFixed(0)}
      </span>
      <div className="relative h-1 w-24 rounded-full bg-surface-2">
        <div
          className="absolute top-1/2 size-2 -translate-y-1/2 rounded-full bg-accent"
          style={{ left: `calc(${pct}% - 4px)` }}
        />
      </div>
      <span className="font-mono text-[10px] tabular-nums text-ink-mute">
        {high.toFixed(0)}
      </span>
    </div>
  );
}

export function WatchlistTable({ items }: { items: WatchlistItemData[] }) {
  const router = useRouter();
  const { quotes } = useLiveQuotes();
  const [symbol, setSymbol] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!symbol.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/watchlist/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Erreur HTTP ${res.status}`);
      } else {
        setSymbol("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id: string) {
    await fetch(`/api/watchlist/items/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleAdd} className="flex items-center gap-2">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="Ajouter un ticker (ex. NVDA)"
          className="w-64 rounded-lg border border-edge bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent/60"
        />
        <button
          type="submit"
          disabled={busy || !symbol.trim()}
          className="cursor-pointer rounded-lg bg-accent/15 px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/25 disabled:opacity-50"
        >
          {busy ? "Vérification…" : "Ajouter"}
        </button>
        {error && <span className="text-sm text-loss">{error}</span>}
      </form>

      {items.length === 0 ? (
        <p className="rounded-xl border border-edge bg-surface py-10 text-center text-sm text-ink-mute">
          Watchlist vide — ajoute un premier ticker ci-dessus.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-edge bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wider text-ink-mute">
                <th className="px-5 py-2.5 font-medium">Instrument</th>
                <th className="px-3 py-2.5 text-right font-medium">Cours</th>
                <th className="px-3 py-2.5 text-right font-medium">Δ jour</th>
                <th className="px-3 py-2.5 text-right font-medium">Δ jour %</th>
                <th className="px-3 py-2.5 font-medium">Plage 52 sem.</th>
                <th className="px-5 py-2.5 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const quote = quotes[item.symbol];
                const dayDelta =
                  quote?.prevClose != null
                    ? quote.last - quote.prevClose
                    : null;
                return (
                  <tr
                    key={item.id}
                    className="border-b border-edge-soft last:border-0"
                  >
                    <td className="px-5 py-2.5">
                      <span className="font-mono text-[13px] font-semibold">
                        {item.symbol}
                      </span>
                      {item.name && (
                        <span className="ml-2 text-xs text-ink-mute">
                          {item.name}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {quote ? (
                        <span className="inline-flex items-center gap-1.5">
                          {formatPrice(quote.last, "USD")}
                          <FreshnessBadge
                            kind={quote.delayed ? "delayed" : "live"}
                          />
                        </span>
                      ) : (
                        <span className="text-ink-mute">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {dayDelta !== null ? (
                        <span className={dayDelta >= 0 ? "text-gain" : "text-loss"}>
                          {formatSignedMoney(dayDelta, "USD")}
                        </span>
                      ) : (
                        <span className="text-ink-mute">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {quote?.dayChangePct != null ? (
                        <span
                          className={
                            quote.dayChangePct >= 0 ? "text-gain" : "text-loss"
                          }
                        >
                          {formatSignedPct(quote.dayChangePct)}
                        </span>
                      ) : (
                        <span className="text-ink-mute">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Range52
                        last={quote?.last ?? null}
                        low={item.low52}
                        high={item.high52}
                      />
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <button
                        onClick={() => handleRemove(item.id)}
                        title="Retirer de la watchlist"
                        className="cursor-pointer rounded-md p-1 text-ink-mute transition-colors hover:bg-surface-2 hover:text-loss"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        >
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
