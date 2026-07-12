"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { STRATEGIES } from "@/lib/strategies";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatPrice,
  formatQty,
  formatSignedMoney,
} from "@/lib/utils/format";

export interface JournalTripView {
  id: string;
  symbol: string;
  optionLabel: string | null;
  secType: string;
  direction: "LONG" | "SHORT";
  status: "OPEN" | "CLOSED";
  openedAt: string;
  closedAt: string | null;
  maxQuantity: number;
  realizedPnl: number | null;
  currency: string;
  commissions: number;
  pnlConfirmed: boolean;
  strategy: string | null;
  tags: string[];
  rating: number | null;
}

interface TripDetail {
  notes: string | null;
  executions: {
    id: string;
    side: "BUY" | "SELL";
    quantity: string;
    price: string;
    commission: string;
    currency: string;
    tradeTime: string;
    fifoPnlRealized: string | null;
    confirmedByActivity: boolean;
    ibkrCodes: string | null;
    source: "TRADE_CONFIRMS" | "ACTIVITY" | "MANUAL";
  }[];
  instrument: { multiplier: string; secType: string };
}

type Filter = "all" | "win" | "loss" | "open";

function holdingLabel(openedAt: string, closedAt: string | null): string {
  const end = closedAt ? new Date(closedAt) : new Date();
  const days = Math.round(
    (end.getTime() - new Date(openedAt).getTime()) / 86_400_000
  );
  if (days < 1) return "intraday";
  return `${days} j`;
}

function DetailPanel({
  trip,
  onSaved,
}: {
  trip: JournalTripView;
  onSaved: () => void;
}) {
  const [panel, setPanel] = useState<
    | { status: "loading" }
    | { status: "error" }
    | { status: "ready"; detail: TripDetail }
  >({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [strategy, setStrategy] = useState(trip.strategy ?? "");
  const [tags, setTags] = useState<string[]>(trip.tags);
  const [tagInput, setTagInput] = useState("");
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState<number | null>(trip.rating);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Chargement dans un effet (jamais pendant le render : StrictMode double
  // les renders, et un re-render du parent relancerait le fetch), avec abort
  // au démontage et gestion du trip disparu (recalculé après suppression).
  // L'état "loading" est posé dans les handlers, pas dans l'effet.
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/round-trips/${trip.id}`, { signal: controller.signal })
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(String(res.status)))
      )
      .then((data) => {
        if (!data.trip) throw new Error("trip absent");
        setPanel({ status: "ready", detail: data.trip });
        setNotes(data.trip.notes ?? "");
      })
      .catch((e: unknown) => {
        if ((e as Error).name !== "AbortError") setPanel({ status: "error" });
      });
    return () => controller.abort();
  }, [trip.id, reloadKey]);

  if (panel.status === "error") {
    return (
      <p className="px-8 py-4 text-sm text-ink-mute">
        Impossible de charger le détail — le trade a peut-être été recalculé.{" "}
        <button
          type="button"
          onClick={() => {
            setPanel({ status: "loading" });
            setReloadKey((k) => k + 1);
          }}
          className="cursor-pointer text-accent underline"
        >
          Réessayer
        </button>
      </p>
    );
  }
  if (panel.status === "loading") {
    return (
      <p className="px-8 py-4 text-sm text-ink-mute">Chargement du détail…</p>
    );
  }

  const detail = panel.detail;
  const multiplier = Number(detail.instrument.multiplier);

  async function save() {
    setSaving(true);
    setSaved(false);
    const res = await fetch(`/api/round-trips/${trip.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        strategy: strategy || null,
        tags,
        notes: notes || null,
        rating,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 3000);
    }
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t) && tags.length < 10) {
      setTags([...tags, t]);
    }
    setTagInput("");
  }

  const inputClass =
    "rounded-lg border border-edge bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-accent/60";
  const grossPnl = trip.realizedPnl ?? 0;
  const netPnl = grossPnl - trip.commissions;

  return (
    <div className="grid gap-5 border-l-2 border-accent/30 bg-surface-2/30 px-6 py-4 lg:grid-cols-2">
      {/* Timeline des exécutions */}
      <div>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-mute">
          Exécutions
        </h4>
        <ul className="flex flex-col gap-1.5">
          {detail.executions.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between rounded-lg border border-edge-soft bg-surface px-3 py-1.5 text-sm"
            >
              <span className="flex items-center gap-2">
                <span className="w-11 text-[10px] font-semibold text-ink-soft">
                  {e.side === "BUY" ? "ACHAT" : "VENTE"}
                </span>
                <span className="font-mono tabular-nums">
                  {formatQty(Number(e.quantity))}
                  {multiplier > 1 && (
                    <span className="text-ink-mute"> ×{multiplier}</span>
                  )}{" "}
                  @ {formatPrice(Number(e.price), e.currency)}
                </span>
                {e.ibkrCodes && (
                  <span className="rounded border border-edge px-1 text-[9px] text-ink-mute">
                    {e.ibkrCodes}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-2 text-xs text-ink-mute">
                {formatDateTime(new Date(e.tradeTime))} · frais{" "}
                {formatMoney(Math.abs(Number(e.commission)), e.currency)}
                {e.source === "MANUAL" && (
                  <button
                    type="button"
                    title="Supprimer cette exécution saisie manuellement"
                    onClick={async () => {
                      if (!window.confirm("Supprimer cette exécution ?")) return;
                      const res = await fetch(`/api/executions/${e.id}`, {
                        method: "DELETE",
                      });
                      if (res.ok) {
                        setPanel({ status: "loading" });
                        setReloadKey((k) => k + 1);
                        onSaved();
                      }
                    }}
                    className="cursor-pointer rounded p-0.5 text-ink-mute hover:text-loss"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
                    </svg>
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="text-ink-soft">
            P&L brut :{" "}
            <span
              className={`font-mono tabular-nums ${grossPnl >= 0 ? "text-gain" : "text-loss"}`}
            >
              {trip.realizedPnl !== null
                ? formatSignedMoney(grossPnl, trip.currency)
                : "—"}
            </span>
          </span>
          <span className="text-ink-soft">
            Frais :{" "}
            <span className="font-mono tabular-nums">
              {formatMoney(trip.commissions, trip.currency)}
            </span>
          </span>
          <span className="text-ink-soft">
            Net :{" "}
            <span
              className={`font-mono font-semibold tabular-nums ${netPnl >= 0 ? "text-gain" : "text-loss"}`}
            >
              {trip.realizedPnl !== null
                ? formatSignedMoney(netPnl, trip.currency)
                : "—"}
            </span>
            {trip.status === "CLOSED" && (
              <span
                className={`ml-2 rounded border px-1 py-px text-[9px] font-semibold ${
                  trip.pnlConfirmed
                    ? "border-edge text-ink-mute"
                    : "border-warn/30 bg-warn/10 text-warn"
                }`}
              >
                {trip.pnlConfirmed ? "CONFIRMÉ" : "ESTIMÉ"}
              </span>
            )}
          </span>
          <span className="text-ink-soft">
            Détention : {holdingLabel(trip.openedAt, trip.closedAt)}
          </span>
        </div>
      </div>

      {/* Journal éditable */}
      <div>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-mute">
          Journal
        </h4>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            className={inputClass}
          >
            <option value="">— stratégie —</option>
            {STRATEGIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1" title="Note personnelle">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(rating === n ? null : n)}
                className={`size-3.5 cursor-pointer rounded-full border transition-colors ${
                  rating !== null && n <= rating
                    ? "border-accent bg-accent"
                    : "border-edge bg-surface hover:border-accent/50"
                }`}
              />
            ))}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent"
            >
              {tag}
              <button
                type="button"
                onClick={() => setTags(tags.filter((t) => t !== tag))}
                className="cursor-pointer hover:text-loss"
              >
                ×
              </button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            onBlur={addTag}
            placeholder="+ tag"
            className="w-20 rounded-full border border-dashed border-edge bg-transparent px-2 py-0.5 text-xs outline-none focus:border-accent/60"
          />
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes — contexte, thèse, leçon à retenir…"
          rows={4}
          className="mt-2 w-full rounded-lg border border-edge bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent/60"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="cursor-pointer rounded-lg bg-accent/15 px-4 py-1.5 text-sm font-medium text-accent hover:bg-accent/25 disabled:opacity-50"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          {saved && <span className="text-xs text-gain">Enregistré ✓</span>}
          <span className="ml-auto text-[10px] text-ink-mute">
            Ces annotations survivent aux ré-imports du courtier
          </span>
        </div>
      </div>
    </div>
  );
}

export function JournalTable({ trips }: { trips: JournalTripView[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = trips.filter((t) => {
    if (filter === "all") return true;
    if (filter === "open") return t.status === "OPEN";
    if (t.status !== "CLOSED") return false;
    const net = (t.realizedPnl ?? 0) - t.commissions;
    return filter === "win" ? net > 0 : net <= 0;
  });

  const filterBtn = (key: Filter, label: string) => (
    <button
      key={key}
      onClick={() => setFilter(key)}
      className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium ${
        filter === key
          ? "bg-accent/15 text-accent"
          : "text-ink-soft hover:text-ink"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-xl border border-edge bg-surface">
      <div className="flex items-center justify-between border-b border-edge-soft px-5 py-3">
        <h3 className="text-sm font-semibold">Round-trips</h3>
        <div className="flex gap-1 rounded-lg border border-edge bg-surface-2/50 p-0.5">
          {filterBtn("all", "Tous")}
          {filterBtn("win", "WIN")}
          {filterBtn("loss", "LOSS")}
          {filterBtn("open", "En cours")}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wider text-ink-mute">
              <th className="px-5 py-2.5 font-medium">Instrument</th>
              <th className="px-3 py-2.5 font-medium">Sens</th>
              <th className="px-3 py-2.5 text-right font-medium">Qté max</th>
              <th className="px-3 py-2.5 font-medium">Ouvert</th>
              <th className="px-3 py-2.5 font-medium">Clôturé</th>
              <th className="px-3 py-2.5 text-right font-medium">P&L net</th>
              <th className="px-5 py-2.5 text-right font-medium">Résultat</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((trip) => {
              const net =
                trip.realizedPnl !== null
                  ? trip.realizedPnl - trip.commissions
                  : null;
              const isOpen = expanded === trip.id;
              return [
                <tr
                  key={trip.id}
                  onClick={() => setExpanded(isOpen ? null : trip.id)}
                  className={`cursor-pointer border-b border-edge-soft transition-colors last:border-0 hover:bg-surface-2/40 ${
                    isOpen ? "bg-surface-2/40" : ""
                  }`}
                >
                  <td className="px-5 py-2">
                    <span
                      className={`mr-2 inline-block transition-transform ${isOpen ? "rotate-90" : ""}`}
                    >
                      ›
                    </span>
                    {trip.optionLabel ? (
                      <span className="font-mono text-[13px]">
                        {trip.optionLabel}
                      </span>
                    ) : (
                      trip.symbol
                    )}
                    <span className="ml-2 rounded border border-edge px-1 py-px text-[9px] text-ink-mute">
                      {trip.secType}
                    </span>
                    {trip.strategy && (
                      <span className="ml-2 rounded bg-accent/10 px-1.5 py-px text-[10px] text-accent">
                        {trip.strategy}
                      </span>
                    )}
                    {trip.tags.map((tag) => (
                      <span
                        key={tag}
                        className="ml-1 rounded-full bg-surface-2 px-1.5 py-px text-[10px] text-ink-soft"
                      >
                        {tag}
                      </span>
                    ))}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-soft">
                    {trip.direction === "LONG" ? "Long" : "Short"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {formatQty(trip.maxQuantity)}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-soft">
                    {formatDate(new Date(trip.openedAt))}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-soft">
                    {trip.closedAt ? formatDate(new Date(trip.closedAt)) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {net !== null ? (
                      <span className={net >= 0 ? "text-gain" : "text-loss"}>
                        {formatSignedMoney(net, trip.currency)}
                      </span>
                    ) : (
                      <span className="text-ink-mute">—</span>
                    )}
                  </td>
                  <td className="px-5 py-2 text-right">
                    {trip.status === "OPEN" ? (
                      <span className="rounded border border-accent/30 bg-accent/10 px-1.5 py-px text-[9px] font-semibold text-accent">
                        EN COURS
                      </span>
                    ) : (net ?? 0) > 0 ? (
                      <span className="rounded border border-gain/30 bg-gain/10 px-1.5 py-px text-[9px] font-semibold text-gain">
                        WIN
                      </span>
                    ) : (
                      <span className="rounded border border-loss/30 bg-loss/10 px-1.5 py-px text-[9px] font-semibold text-loss">
                        LOSS
                      </span>
                    )}
                  </td>
                </tr>,
                isOpen ? (
                  <tr key={`${trip.id}-detail`}>
                    <td colSpan={7} className="p-0">
                      <DetailPanel trip={trip} onSaved={() => router.refresh()} />
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-ink-mute">
            Aucun trade pour ce filtre.
          </p>
        )}
      </div>
    </div>
  );
}
