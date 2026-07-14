"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type AlertRuleType =
  | "PRICE_ABOVE"
  | "PRICE_BELOW"
  | "PCT_CHANGE_DAY"
  | "POSITION_PNL_ABOVE"
  | "POSITION_PNL_BELOW"
  | "RSI_BELOW"
  | "RSI_ABOVE"
  | "SMA_CROSS_UP"
  | "SMA_CROSS_DOWN"
  | "BREAKOUT_HIGH"
  | "BREAKOUT_LOW"
  | "IV_ABOVE"
  | "IV_BELOW"
  | "PUT_CALL_ABOVE"
  | "GAMMA_FLIP_NEAR";

export interface AlertRuleView {
  id: string;
  type: AlertRuleType;
  label: string;
  threshold: number;
  state: "ARMED" | "TRIGGERED" | "COOLDOWN" | "DISABLED";
  rearmMode: "MANUAL" | "AUTO_ON_RECROSS" | "AUTO_AFTER_COOLDOWN";
  cooldownSeconds: number;
  lastTriggeredAt: string | null;
  notifyTelegram: boolean;
  notifyDiscord: boolean;
  /** Paramètres d'indicateur (RSI: period ; SMA cross: fast/slow) */
  params?: { period?: number; fast?: number; slow?: number } | null;
}

/** Libellé des périodes d'indicateur pour la liste des règles. */
function paramLabel(rule: AlertRuleView): string {
  const p = rule.params ?? {};
  if (rule.type === "SMA_CROSS_UP" || rule.type === "SMA_CROSS_DOWN") {
    return `MM${p.fast ?? 9}/MM${p.slow ?? 21}`;
  }
  if (rule.type === "RSI_BELOW" || rule.type === "RSI_ABOVE") {
    return `RSI(${p.period ?? 14})`;
  }
  return "";
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

const CONDITION_LABEL: Record<AlertRuleType, string> = {
  PRICE_ABOVE: "franchit ↑",
  PRICE_BELOW: "franchit ↓",
  PCT_CHANGE_DAY: "bouge de ±%",
  POSITION_PNL_ABOVE: "P&L latent ≥",
  POSITION_PNL_BELOW: "P&L latent ≤",
  RSI_BELOW: "RSI sous",
  RSI_ABOVE: "RSI au-dessus de",
  SMA_CROSS_UP: "croisement MM ↑",
  SMA_CROSS_DOWN: "croisement MM ↓",
  BREAKOUT_HIGH: "casse le plus-haut (j)",
  BREAKOUT_LOW: "casse le plus-bas (j)",
  IV_ABOVE: "IV ATM ≥",
  IV_BELOW: "IV ATM ≤",
  PUT_CALL_ABOVE: "put/call ≥",
  GAMMA_FLIP_NEAR: "proche gamma flip ≤",
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
  const [scope, setScope] = useState<
    "ticker" | "position" | "indicator" | "option"
  >("ticker");
  const [symbol, setSymbol] = useState("");
  const [instrumentId, setInstrumentId] = useState("");
  const [type, setType] = useState<AlertRuleType>("PRICE_ABOVE");
  const [threshold, setThreshold] = useState("");
  // Paramètres d'indicateur (analyse technique)
  const [period, setPeriod] = useState("14");
  const [fast, setFast] = useState("9");
  const [slow, setSlow] = useState("21");
  const [notifyTelegram, setNotifyTelegram] = useState(true);
  const [notifyDiscord, setNotifyDiscord] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(300);
  const [rearmMode, setRearmMode] =
    useState<AlertRuleView["rearmMode"]>("AUTO_ON_RECROSS");

  async function api(
    path: string,
    init: RequestInit,
    okRefresh = true
  ): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, init);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Erreur HTTP ${res.status}`);
        return false;
      }
      if (okRefresh) router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  const isSmaCross = type === "SMA_CROSS_UP" || type === "SMA_CROSS_DOWN";
  const isBreakout = type === "BREAKOUT_HIGH" || type === "BREAKOUT_LOW";
  const isRsi = type === "RSI_BELOW" || type === "RSI_ABOVE";

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const ok = await api("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        symbol: scope === "position" ? undefined : symbol,
        instrumentId: scope === "position" ? instrumentId : undefined,
        // SMA cross : pas de seuil scalaire (périodes dans fast/slow)
        threshold: isSmaCross ? undefined : Number(threshold),
        period: isRsi ? Number(period) : undefined,
        fast: isSmaCross ? Number(fast) : undefined,
        slow: isSmaCross ? Number(slow) : undefined,
        notifyTelegram,
        notifyDiscord,
        cooldownSeconds,
        rearmMode,
      }),
    });
    // Ne vide la saisie que sur succès (sinon on perd le formulaire sur erreur)
    if (ok) setThreshold("");
  }

  const inputClass =
    "rounded-lg border border-edge bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent/60";
  const isIvType = type === "IV_ABOVE" || type === "IV_BELOW";
  const isPctType = isIvType || type === "GAMMA_FLIP_NEAR";
  const unit =
    type === "PCT_CHANGE_DAY" || isPctType
      ? "%"
      : type.startsWith("POSITION")
        ? "€"
        : isRsi || type === "PUT_CALL_ABOVE"
          ? "" // niveau RSI (0-100) ou ratio put/call
          : isBreakout
            ? "j" // nb de séances
            : "$";

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
              const s = e.target.value as
                | "ticker"
                | "position"
                | "indicator"
                | "option";
              setScope(s);
              setType(
                s === "position"
                  ? "POSITION_PNL_ABOVE"
                  : s === "indicator"
                    ? "RSI_BELOW"
                    : s === "option"
                      ? "IV_ABOVE"
                      : "PRICE_ABOVE"
              );
            }}
            className={inputClass}
          >
            <option value="ticker">le ticker</option>
            <option value="indicator">l&apos;indicateur (analyse technique)</option>
            <option value="option">les options (IV / gamma)</option>
            <option value="position" disabled={positions.length === 0}>
              la position
            </option>
          </select>
          {scope !== "position" ? (
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder={scope === "indicator" ? "SPY" : "AAPL"}
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
            onChange={(e) => setType(e.target.value as AlertRuleType)}
            className={inputClass}
          >
            {scope === "ticker" && (
              <>
                <option value="PRICE_ABOVE">franchit ↑</option>
                <option value="PRICE_BELOW">franchit ↓</option>
                <option value="PCT_CHANGE_DAY">bouge de ± (%)</option>
              </>
            )}
            {scope === "indicator" && (
              <>
                <option value="RSI_BELOW">RSI sous (survendu)</option>
                <option value="RSI_ABOVE">RSI au-dessus (suracheté)</option>
                <option value="SMA_CROSS_UP">croisement MM haussier</option>
                <option value="SMA_CROSS_DOWN">croisement MM baissier</option>
                <option value="BREAKOUT_HIGH">casse plus-haut N j</option>
                <option value="BREAKOUT_LOW">casse plus-bas N j</option>
              </>
            )}
            {scope === "option" && (
              <>
                <option value="IV_ABOVE">IV ATM ≥ (%)</option>
                <option value="IV_BELOW">IV ATM ≤ (%)</option>
                <option value="PUT_CALL_ABOVE">put/call ≥ (ratio)</option>
                <option value="GAMMA_FLIP_NEAR">proche gamma flip ≤ (%)</option>
              </>
            )}
            {scope === "position" && (
              <>
                <option value="POSITION_PNL_ABOVE">P&L latent ≥</option>
                <option value="POSITION_PNL_BELOW">P&L latent ≤</option>
              </>
            )}
          </select>
          {isSmaCross ? (
            <div className="flex items-center gap-1.5 font-mono text-xs">
              <input
                value={fast}
                onChange={(e) => setFast(e.target.value)}
                type="number"
                min="2"
                required
                aria-label="Période courte"
                className={`${inputClass} w-16`}
              />
              <span className="text-ink-mute">/</span>
              <input
                value={slow}
                onChange={(e) => setSlow(e.target.value)}
                type="number"
                min="3"
                required
                aria-label="Période longue"
                className={`${inputClass} w-16`}
              />
              <span className="text-ink-mute">j</span>
            </div>
          ) : (
            <div className="relative">
              <input
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                type="number"
                // breakout = nb entier de séances ; RSI = niveau 0-100
                step={isBreakout ? "1" : "any"}
                min={isBreakout ? "2" : isRsi ? "1" : undefined}
                max={isBreakout ? "400" : isRsi ? "99" : undefined}
                required
                placeholder={
                  isRsi || isIvType
                    ? "30"
                    : isBreakout
                      ? "20"
                      : type === "PUT_CALL_ABOVE"
                        ? "1.2"
                        : type === "GAMMA_FLIP_NEAR"
                          ? "0.5"
                          : "190"
                }
                className={`${inputClass} w-28 pr-7 font-mono`}
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-mute">
                {unit}
              </span>
            </div>
          )}
          {isRsi && (
            <label className="flex items-center gap-1.5 text-xs text-ink-soft">
              période
              <input
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                type="number"
                min="2"
                max="100"
                required
                aria-label="Période RSI"
                className={`${inputClass} w-16 font-mono`}
              />
            </label>
          )}
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
                        {paramLabel(rule) && (
                          <span className="mr-1 font-mono text-ink-mute">
                            {paramLabel(rule)}
                          </span>
                        )}
                        {CONDITION_LABEL[rule.type]}
                        {rule.type !== "SMA_CROSS_UP" &&
                          rule.type !== "SMA_CROSS_DOWN" && (
                            <>
                              {" "}
                              <span className="font-mono tabular-nums">
                                {rule.threshold}
                                {rule.type === "PCT_CHANGE_DAY" ||
                                rule.type === "IV_ABOVE" ||
                                rule.type === "IV_BELOW" ||
                                rule.type === "GAMMA_FLIP_NEAR"
                                  ? " %"
                                  : rule.type.startsWith("POSITION")
                                    ? " €"
                                    : rule.type === "BREAKOUT_HIGH" ||
                                        rule.type === "BREAKOUT_LOW"
                                      ? " j"
                                      : ""}
                              </span>
                            </>
                          )}
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
