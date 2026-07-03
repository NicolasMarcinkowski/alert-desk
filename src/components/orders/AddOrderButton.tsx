"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Saisie manuelle d'un ordre exécuté — la porte d'entrée de la v0 sans
 * broker lié. Crée une exécution sur le compte manuel (auto-créé), le
 * pipeline (positions, journal, analytics, quotes live) suit tout seul.
 */
export function AddOrderButton({ variant = "primary" }: { variant?: "primary" | "ghost" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [secType, setSecType] = useState<"STK" | "OPT" | "OTHER">("STK");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [defaultTradeAt, setDefaultTradeAt] = useState("");

  function openForm() {
    setDefaultTradeAt(
      new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    );
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/executions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        side,
        secType,
        symbol: fd.get("symbol"),
        currency: fd.get("currency"),
        quantity: Number(fd.get("quantity")),
        price: Number(fd.get("price")),
        fees: Number(fd.get("fees") || 0),
        tradeAt: new Date(String(fd.get("tradeAt"))).toISOString(),
        fxRateToBase: fd.get("fx") ? Number(fd.get("fx")) : undefined,
        strike: secType === "OPT" ? Number(fd.get("strike")) : undefined,
        expiry: secType === "OPT" ? fd.get("expiry") : undefined,
        putCall: secType === "OPT" ? fd.get("putCall") : undefined,
        multiplier: secType === "OPT" ? Number(fd.get("multiplier") || 100) : undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? `Erreur HTTP ${res.status}`);
    } else {
      setOpen(false);
      router.refresh();
    }
  }

  const inputClass =
    "w-full rounded-lg border border-edge bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent/60";

  return (
    <>
      <button
        type="button"
        onClick={openForm}
        className={
          variant === "primary"
            ? "cursor-pointer rounded-lg bg-accent/15 px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/25"
            : "cursor-pointer rounded-lg border border-edge bg-surface px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent/50"
        }
      >
        + Ajouter un ordre
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/70 p-4 backdrop-blur-sm"
          onClick={() => !busy && setOpen(false)}
        >
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-xl border border-edge bg-surface p-5 shadow-2xl"
          >
            <h3 className="mb-1 text-sm font-semibold">Ajouter un ordre exécuté</h3>
            <p className="mb-4 text-xs text-ink-mute">
              Saisie manuelle sur ton portefeuille — aucun ordre n&apos;est
              passé chez un broker.
            </p>

            {error && (
              <p className="mb-3 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-sm text-loss">
                {error}
              </p>
            )}

            <div className="mb-3 flex gap-2">
              {(
                [
                  ["STK", "Action"],
                  ["OPT", "Option"],
                  ["OTHER", "Autre"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSecType(value)}
                  className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    secType === value
                      ? "border-accent/50 bg-accent/10 text-accent"
                      : "border-edge bg-surface-2 text-ink-soft"
                  }`}
                >
                  {label}
                </button>
              ))}
              <span className="mx-1 w-px bg-edge" />
              {(
                [
                  ["BUY", "Achat"],
                  ["SELL", "Vente"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSide(value)}
                  className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    side === value
                      ? "border-accent/50 bg-accent/10 text-accent"
                      : "border-edge bg-surface-2 text-ink-soft"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-ink-soft">
                {secType === "OPT" ? "Sous-jacent" : "Symbole"}
                <input
                  name="symbol"
                  required
                  placeholder="AAPL"
                  className={`mt-1 font-mono ${inputClass}`}
                />
              </label>
              <label className="text-xs text-ink-soft">
                Devise
                <select name="currency" defaultValue="USD" className={`mt-1 ${inputClass}`}>
                  {["USD", "EUR", "GBP", "CHF", "CAD"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>

              {secType === "OPT" && (
                <>
                  <label className="text-xs text-ink-soft">
                    Strike
                    <input
                      name="strike"
                      required
                      type="number"
                      step="any"
                      min="0.01"
                      placeholder="190"
                      className={`mt-1 font-mono ${inputClass}`}
                    />
                  </label>
                  <label className="text-xs text-ink-soft">
                    Échéance
                    <input name="expiry" required type="date" className={`mt-1 ${inputClass}`} />
                  </label>
                  <label className="text-xs text-ink-soft">
                    Call / Put
                    <select name="putCall" className={`mt-1 ${inputClass}`}>
                      <option value="CALL">Call</option>
                      <option value="PUT">Put</option>
                    </select>
                  </label>
                  <label className="text-xs text-ink-soft">
                    Multiplicateur
                    <input
                      name="multiplier"
                      type="number"
                      defaultValue={100}
                      min="1"
                      className={`mt-1 font-mono ${inputClass}`}
                    />
                  </label>
                </>
              )}

              <label className="text-xs text-ink-soft">
                Quantité{secType === "OPT" ? " (contrats)" : ""}
                <input
                  name="quantity"
                  required
                  type="number"
                  step="any"
                  min="0.0001"
                  className={`mt-1 font-mono ${inputClass}`}
                />
              </label>
              <label className="text-xs text-ink-soft">
                Prix unitaire{secType === "OPT" ? " (par action)" : ""}
                <input
                  name="price"
                  required
                  type="number"
                  step="any"
                  min="0.000001"
                  className={`mt-1 font-mono ${inputClass}`}
                />
              </label>
              <label className="text-xs text-ink-soft">
                Frais
                <input
                  name="fees"
                  type="number"
                  step="any"
                  min="0"
                  defaultValue={0}
                  className={`mt-1 font-mono ${inputClass}`}
                />
              </label>
              <label className="text-xs text-ink-soft">
                Exécuté le
                <input
                  name="tradeAt"
                  required
                  type="datetime-local"
                  defaultValue={defaultTradeAt}
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <label className="col-span-2 text-xs text-ink-soft">
                Taux de change vers ta devise de base (optionnel)
                <input
                  name="fx"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="auto (1 si même devise)"
                  className={`mt-1 font-mono ${inputClass}`}
                />
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
                className="cursor-pointer rounded-lg border border-edge bg-surface-2 px-4 py-2 text-sm"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={busy}
                className="cursor-pointer rounded-lg bg-accent/15 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/25 disabled:opacity-50"
              >
                {busy ? "Ajout…" : "Ajouter l'ordre"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
