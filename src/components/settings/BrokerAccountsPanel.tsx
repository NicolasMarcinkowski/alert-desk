"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface BrokerAccountView {
  id: string;
  label: string;
  broker: "MANUAL" | "IBKR";
  externalAccountId: string | null;
  baseCurrency: string;
  status: "ACTIVE" | "AUTH_ERROR" | "DISABLED";
  queries: {
    type: "TRADE_CONFIRMS" | "ACTIVITY";
    queryId: string;
    lastSuccessAt: string | null;
  }[];
}

const STATUS_BADGE: Record<
  BrokerAccountView["status"],
  { label: string; className: string }
> = {
  ACTIVE: {
    label: "Connecté",
    className: "text-gain border-gain/30 bg-gain/10",
  },
  AUTH_ERROR: {
    label: "Erreur d'auth",
    className: "text-loss border-loss/30 bg-loss/10",
  },
  DISABLED: {
    label: "Désactivé",
    className: "text-ink-mute border-edge bg-surface-2",
  },
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "jamais";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(new Date(iso));
}

export function BrokerAccountsPanel({
  accounts,
}: {
  accounts: BrokerAccountView[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);
  const [showForm, setShowForm] = useState(accounts.length === 0);

  async function call(
    key: string,
    fn: () => Promise<Response>,
    okText: string
  ) {
    setBusy(key);
    setMessage(null);
    try {
      const res = await fn();
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setMessage({
          kind: "error",
          text: data.error ?? `Erreur HTTP ${res.status}`,
        });
      } else if (key.startsWith("test:")) {
        const failed = (data.results ?? []).filter(
          (r: { ok: boolean }) => !r.ok
        );
        setMessage(
          failed.length === 0
            ? { kind: "ok", text: okText }
            : {
                kind: "error",
                text: failed
                  .map(
                    (r: { queryId: string; error?: string }) =>
                      `Query ${r.queryId} : ${r.error}`
                  )
                  .join(" · "),
              }
        );
      } else {
        setMessage({ kind: "ok", text: okText });
      }
      router.refresh();
    } catch (e) {
      setMessage({ kind: "error", text: String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function handleAdd(formData: FormData) {
    await call(
      "add",
      () =>
        fetch("/api/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: formData.get("label"),
            flexToken: formData.get("flexToken"),
            queryIdTradeConfirms: formData.get("queryIdTradeConfirms"),
            queryIdActivity: formData.get("queryIdActivity"),
            baseCurrency: formData.get("baseCurrency"),
          }),
        }),
      "Compte ajouté. Lance un test de connexion puis une sync."
    );
    setShowForm(false);
  }

  const inputClass =
    "w-full rounded-lg border border-edge bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent/60";
  const btnClass =
    "cursor-pointer rounded-lg border border-edge bg-surface-2 px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent/50 disabled:cursor-wait disabled:opacity-50";

  return (
    <div className="flex flex-col gap-4">
      {message && (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            message.kind === "ok"
              ? "border-gain/30 bg-gain/10 text-gain"
              : "border-loss/30 bg-loss/10 text-loss"
          }`}
        >
          {message.text}
        </p>
      )}

      {accounts.map((account) => {
        const badge = STATUS_BADGE[account.status];
        return (
          <div
            key={account.id}
            className="rounded-xl border border-edge bg-surface p-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">{account.label}</span>
                <span className="font-mono text-xs text-ink-mute">
                  {account.broker === "MANUAL"
                    ? "saisie manuelle"
                    : (account.externalAccountId ?? "ID appris au 1er import")}
                </span>
                <span
                  className={`rounded border px-1.5 py-px text-[10px] font-semibold ${badge.className}`}
                >
                  {badge.label}
                </span>
                <span className="text-xs text-ink-mute">
                  base {account.baseCurrency}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {account.broker === "IBKR" && (
                  <>
                    <button
                      className={btnClass}
                      disabled={busy !== null}
                      onClick={() =>
                        call(
                          `test:${account.id}`,
                          () =>
                            fetch(`/api/accounts/${account.id}/test`, {
                              method: "POST",
                            }),
                          "Connexion Flex OK sur toutes les queries."
                        )
                      }
                    >
                      {busy === `test:${account.id}` ? "Test…" : "Tester"}
                    </button>
                    <button
                      className={btnClass}
                      disabled={busy !== null}
                      onClick={() =>
                        call(
                          `sync:${account.id}`,
                          () =>
                            fetch("/api/sync", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ accountId: account.id }),
                            }),
                          "Sync terminée."
                        )
                      }
                    >
                      {busy === `sync:${account.id}` ? "Sync…" : "Sync now"}
                    </button>
                  </>
                )}
                <button
                  className={`${btnClass} hover:border-loss/50 hover:text-loss`}
                  disabled={busy !== null}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Supprimer « ${account.label} » et toutes ses données importées ?`
                      )
                    ) {
                      call(
                        `del:${account.id}`,
                        () =>
                          fetch(`/api/accounts/${account.id}`, {
                            method: "DELETE",
                          }),
                        "Compte supprimé."
                      );
                    }
                  }}
                >
                  Supprimer
                </button>
              </div>
            </div>
            <div
              className={`mt-3 grid gap-2 text-xs text-ink-soft sm:grid-cols-2 ${
                account.broker === "MANUAL" ? "hidden" : ""
              }`}
            >
              {account.queries.map((q) => (
                <div
                  key={q.type}
                  className="flex items-center justify-between rounded-lg border border-edge-soft bg-surface-2/50 px-3 py-2"
                >
                  <span>
                    {q.type === "TRADE_CONFIRMS"
                      ? "Trade Confirms (intraday)"
                      : "Activity (nightly)"}
                    <span className="ml-2 font-mono text-ink-mute">
                      #{q.queryId}
                    </span>
                  </span>
                  <span className="text-ink-mute">
                    sync : {formatDateTime(q.lastSuccessAt)}
                  </span>
                </div>
              ))}
              {account.queries.length === 0 && (
                <p className="text-ink-mute">Aucune Flex Query configurée.</p>
              )}
            </div>
          </div>
        );
      })}

      {showForm ? (
        <form
          action={handleAdd}
          className="rounded-xl border border-edge bg-surface p-4"
        >
          <h3 className="mb-3 text-sm font-semibold">Relier un compte IBKR</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-ink-soft">
              Libellé
              <input
                name="label"
                required
                placeholder="Compte principal"
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs text-ink-soft">
              Token Flex Web Service
              <input
                name="flexToken"
                required
                type="password"
                placeholder="chiffré en base (AES-256-GCM)"
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs text-ink-soft">
              Query ID — Trade Confirms
              <input
                name="queryIdTradeConfirms"
                placeholder="ex. 123456"
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs text-ink-soft">
              Query ID — Activity
              <input
                name="queryIdActivity"
                placeholder="ex. 123457"
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs text-ink-soft">
              Devise de base
              <select name="baseCurrency" className={`mt-1 ${inputClass}`}>
                <option value="EUR">EUR €</option>
                <option value="USD">USD $</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={busy !== null}
              className="cursor-pointer rounded-lg bg-accent/15 px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/25 disabled:opacity-50"
            >
              {busy === "add" ? "Ajout…" : "Ajouter le compte"}
            </button>
            {accounts.length > 0 && (
              <button
                type="button"
                className={btnClass}
                onClick={() => setShowForm(false)}
              >
                Annuler
              </button>
            )}
          </div>
        </form>
      ) : (
        <button
          className="cursor-pointer self-start rounded-lg border border-dashed border-edge px-4 py-2 text-sm text-ink-soft transition-colors hover:border-accent/50 hover:text-ink"
          onClick={() => setShowForm(true)}
        >
          + Relier un compte IBKR
        </button>
      )}
    </div>
  );
}
