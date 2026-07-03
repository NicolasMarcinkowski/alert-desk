"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface AlertRuleView {
  id: string;
  type:
    | "PRICE_ABOVE"
    | "PRICE_BELOW"
    | "PCT_CHANGE_DAY"
    | "POSITION_PNL_ABOVE"
    | "POSITION_PNL_BELOW";
  label: string;
  threshold: number;
  state: "ARMED" | "TRIGGERED" | "COOLDOWN" | "DISABLED";
  rearmMode: "MANUAL" | "AUTO_ON_RECROSS" | "AUTO_AFTER_COOLDOWN";
  cooldownSeconds: number;
  lastTriggeredAt: string | null;
  notifyTelegram: boolean;
  notifyDiscord: boolean;
}

export interface AlertEventView {
  id: string;
  triggeredAt: string;
  message: string;
  deliveries: Record<string, { ok: boolean; error?: string }> | null;
}

export interface PositionOption {
  instrumentId: string;
  label: string;
}

const CONDITION_LABEL: Record<AlertRuleView["type"], string> = {
  PRICE_ABOVE: "franchit ↑",
  PRICE_BELOW: "franchit ↓",
  PCT_CHANGE_DAY: "bouge de ±%",
  POSITION_PNL_ABOVE: "P&L latent ≥",
  POSITION_PNL_BELOW: "P&L latent ≤",
};

const STATE_BADGE: Record<
  AlertRuleView["state"],
  { label: string; className: string }
> = {
  ARMED: { label: "Active", className: "text-gain border-gain/30 bg-gain/10" },
  TRIGGERED: {
    label: "Déclenchée",
    className: "text-accent border-accent/30 bg-accent/10",
  },
  COOLDOWN: {
    label: "Cooldown",
    className: "text-warn border-warn/30 bg-warn/10",
  },
  DISABLED: {
    label: "En pause",
    className: "text-ink-mute border-edge bg-surface-2",
  },
};

const COOLDOWNS = [
  { value: 60, label: "1 min" },
  { value: 300, label: "5 min" },
  { value: 600, label: "10 min" },
  { value: 1800, label: "30 min" },
  { value: 3600, label: "1 h" },
];

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(new Date(iso));
}

export function AlertsPanel({
  rules,
  events,
  positions,
  hasChannel,
}: {
  rules: AlertRuleView[];
  events: AlertEventView[];
  positions: PositionOption[];
  hasChannel: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Builder
  const [scope, setScope] = useState<"ticker" | "position">("ticker");
  const [symbol, setSymbol] = useState("");
  const [instrumentId, setInstrumentId] = useState("");
  const [type, setType] = useState<AlertRuleView["type"]>("PRICE_ABOVE");
  const [threshold, setThreshold] = useState("");
  const [notifyTelegram, setNotifyTelegram] = useState(true);
  const [notifyDiscord, setNotifyDiscord] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(300);
  const [rearmMode, setRearmMode] =
    useState<AlertRuleView["rearmMode"]>("AUTO_ON_RECROSS");

  async function api(path: string, init: RequestInit, okRefresh = true) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, init);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? `Erreur HTTP ${res.status}`);
      else if (okRefresh) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await api("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        symbol: scope === "ticker" ? symbol : undefined,
        instrumentId: scope === "position" ? instrumentId : undefined,
        threshold: Number(threshold),
        notifyTelegram,
        notifyDiscord,
        cooldownSeconds,
        rearmMode,
      }),
    });
    setThreshold("");
  }

  const inputClass =
    "rounded-lg border border-edge bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent/60";
  const unit =
    type === "PCT_CHANGE_DAY" ? "%" : type.startsWith("POSITION") ? "€" : "$";

  return (
    <div className="flex flex-col gap-5">
      {!hasChannel && (
        <p className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm text-warn">
          Aucun canal de notification configuré — les alertes se déclencheront
          mais n&apos;enverront rien. Configure Telegram ou Discord dans les
          réglages.
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-sm text-loss">
          {error}
        </p>
      )}

      {/* Builder en phrase */}
      <form
        onSubmit={handleCreate}
        className="rounded-xl border border-edge bg-surface p-4"
      >
        <h3 className="mb-3 text-sm font-semibold">Nouvelle alerte</h3>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-mono text-xs font-semibold tracking-wider text-ink-mute">
            SI
          </span>
          <select
            value={scope}
            onChange={(e) => {
              const s = e.target.value as "ticker" | "position";
              setScope(s);
              setType(s === "ticker" ? "PRICE_ABOVE" : "POSITION_PNL_ABOVE");
            }}
            className={inputClass}
          >
            <option value="ticker">le ticker</option>
            <option value="position" disabled={positions.length === 0}>
              la position
            </option>
          </select>
          {scope === "ticker" ? (
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="AAPL"
              required
              className={`${inputClass} w-28 font-mono`}
            />
          ) : (
            <select
              value={instrumentId}
              onChange={(e) => setInstrumentId(e.target.value)}
              required
              className={`${inputClass} max-w-64`}
            >
              <option value="">— choisir —</option>
              {positions.map((p) => (
                <option key={p.instrumentId} value={p.instrumentId}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
          <select
            value={type}
            onChange={(e) => setType(e.target.value as AlertRuleView["type"])}
            className={inputClass}
          >
            {scope === "ticker" ? (
              <>
                <option value="PRICE_ABOVE">franchit ↑</option>
                <option value="PRICE_BELOW">franchit ↓</option>
                <option value="PCT_CHANGE_DAY">bouge de ± (%)</option>
              </>
            ) : (
              <>
                <option value="POSITION_PNL_ABOVE">P&L latent ≥</option>
                <option value="POSITION_PNL_BELOW">P&L latent ≤</option>
              </>
            )}
          </select>
          <div className="relative">
            <input
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              type="number"
              step="any"
              required
              placeholder="190"
              className={`${inputClass} w-28 pr-7 font-mono`}
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-mute">
              {unit}
            </span>
          </div>
          <span className="font-mono text-xs font-semibold tracking-wider text-ink-mute">
            ALORS
          </span>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={notifyTelegram}
              onChange={(e) => setNotifyTelegram(e.target.checked)}
            />
            Telegram
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={notifyDiscord}
              onChange={(e) => setNotifyDiscord(e.target.checked)}
            />
            Discord
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-soft">
          <label className="flex items-center gap-2">
            Cooldown
            <select
              value={cooldownSeconds}
              onChange={(e) => setCooldownSeconds(Number(e.target.value))}
              className={inputClass}
            >
              {COOLDOWNS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Réarmement
            <select
              value={rearmMode}
              onChange={(e) =>
                setRearmMode(e.target.value as AlertRuleView["rearmMode"])
              }
              className={inputClass}
            >
              <option value="AUTO_ON_RECROSS">auto (au recroisement)</option>
              <option value="AUTO_AFTER_COOLDOWN">auto (après cooldown)</option>
              <option value="MANUAL">manuel</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={busy}
            className="ml-auto cursor-pointer rounded-lg bg-accent/15 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/25 disabled:opacity-50"
          >
            Créer l&apos;alerte
          </button>
        </div>
      </form>

      {/* Règles */}
      <div className="rounded-xl border border-edge bg-surface">
        <div className="border-b border-edge-soft px-5 py-3.5">
          <h3 className="text-sm font-semibold">Règles</h3>
        </div>
        {rules.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-mute">
            Aucune règle — crée ta première alerte ci-dessus.
          </p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {rules.map((rule) => {
                const badge = STATE_BADGE[rule.state];
                return (
                  <tr
                    key={rule.id}
                    className="border-b border-edge-soft last:border-0"
                  >
                    <td className="px-5 py-2.5">
                      <span className="font-mono text-[13px] font-semibold">
                        {rule.label}
                      </span>
                      <span className="ml-2 text-xs text-ink-soft">
                        {CONDITION_LABEL[rule.type]}{" "}
                        <span className="font-mono tabular-nums">
                          {rule.threshold}
                          {rule.type === "PCT_CHANGE_DAY"
                            ? " %"
                            : rule.type.startsWith("POSITION")
                              ? " €"
                              : ""}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-ink-mute">
                      {[
                        rule.notifyTelegram ? "Telegram" : null,
                        rule.notifyDiscord ? "Discord" : null,
                      ]
                        .filter(Boolean)
                        .join(" + ") || "aucun canal"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded border px-1.5 py-px text-[10px] font-semibold ${badge.className}`}
                        title={
                          rule.lastTriggeredAt
                            ? `Dernier déclenchement : ${formatTime(rule.lastTriggeredAt)}`
                            : undefined
                        }
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right text-xs">
                      <div className="flex justify-end gap-2">
                        {(rule.state === "TRIGGERED" ||
                          rule.state === "COOLDOWN") && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              api(`/api/alerts/${rule.id}/rearm`, {
                                method: "POST",
                              })
                            }
                            className="cursor-pointer rounded border border-edge px-2 py-1 hover:border-accent/50"
                          >
                            Réarmer
                          </button>
                        )}
                        <button
                          disabled={busy}
                          onClick={() =>
                            api(`/api/alerts/${rule.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                action:
                                  rule.state === "DISABLED" ? "resume" : "pause",
                              }),
                            })
                          }
                          className="cursor-pointer rounded border border-edge px-2 py-1 hover:border-accent/50"
                        >
                          {rule.state === "DISABLED" ? "Reprendre" : "Pause"}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            api(`/api/alerts/${rule.id}`, { method: "DELETE" })
                          }
                          className="cursor-pointer rounded border border-edge px-2 py-1 hover:border-loss/50 hover:text-loss"
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Historique */}
      <div className="rounded-xl border border-edge bg-surface">
        <div className="border-b border-edge-soft px-5 py-3.5">
          <h3 className="text-sm font-semibold">
            Historique de déclenchements
          </h3>
        </div>
        {events.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-mute">
            Aucun déclenchement pour l&apos;instant.
          </p>
        ) : (
          <ul className="divide-y divide-edge-soft">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex items-center justify-between px-5 py-2.5 text-sm"
              >
                <span>{event.message.replace(/^ALERT DESK — /, "")}</span>
                <span className="flex items-center gap-3 text-xs text-ink-mute">
                  {event.deliveries &&
                    Object.entries(event.deliveries).map(([channel, r]) => (
                      <span
                        key={channel}
                        className={r.ok ? "text-gain" : "text-loss"}
                        title={r.error}
                      >
                        {channel} {r.ok ? "✓" : "✗"}
                      </span>
                    ))}
                  {formatTime(event.triggeredAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
