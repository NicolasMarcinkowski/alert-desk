"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/utils/format";
import { PlatformLogo, PLATFORM_LABEL } from "./PlatformLogo";

export interface ConnectorAccountView {
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

// DA : vert/rouge réservés au P&L. Les statuts de connexion utilisent
// l'accent (ok), l'ambre "attention" (erreur) et le neutre (désactivé).
const STATUS_BADGE: Record<
  ConnectorAccountView["status"],
  { label: string; className: string }
> = {
  ACTIVE: {
    label: "Connecté",
    className: "text-accent border-accent/30 bg-accent/10",
  },
  AUTH_ERROR: {
    label: "Erreur de connexion",
    className: "text-warn border-warn/30 bg-warn/10",
  },
  DISABLED: {
    label: "Désactivé",
    className: "text-ink-mute border-edge bg-surface-2",
  },
};

const inputClass =
  "w-full rounded-lg border border-edge bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent/60";
const btnClass =
  "cursor-pointer rounded-lg border border-edge bg-surface-2 px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent/50 disabled:cursor-wait disabled:opacity-50";
const primaryBtnClass =
  "cursor-pointer rounded-lg bg-accent/15 px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40";

export function ConnectorsPanel({
  accounts,
}: {
  accounts: ConnectorAccountView[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [wizard, setWizard] = useState<"ibkr" | "manual" | null>(null);
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

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
                      `Rapport ${r.queryId} : ${r.error}`
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

  return (
    <div className="flex flex-col gap-5">
      {message && (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            message.kind === "ok"
              ? "border-accent/30 bg-accent/10 text-accent"
              : "border-warn/30 bg-warn/10 text-warn"
          }`}
        >
          {message.text}
        </p>
      )}

      {accounts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-edge bg-surface px-6 py-8 text-center">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            className="text-ink-mute"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <span className="text-sm font-semibold text-ink-soft">
            Aucun compte relié
          </span>
          <span className="max-w-70 text-xs leading-relaxed text-ink-mute">
            Commencez par la saisie manuelle — c&apos;est le moyen le plus
            rapide de démarrer.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="text-[10px] font-bold uppercase tracking-[.09em] text-ink-mute">
            Comptes reliés
          </div>
          {accounts.map((account) => {
            const badge = STATUS_BADGE[account.status];
            const lastSync = account.queries
              .map((q) => q.lastSuccessAt)
              .filter((d): d is string => d !== null)
              .sort()
              .at(-1);
            return (
              <div
                key={account.id}
                className="flex items-center gap-3.5 rounded-xl border border-edge bg-surface px-4 py-4"
              >
                <PlatformLogo platform={account.broker} size={42} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">
                      {account.label}
                    </span>
                    <span
                      className={`rounded border px-1.5 py-px text-[10px] font-semibold ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-ink-mute">
                    <span>{PLATFORM_LABEL[account.broker]}</span>
                    {account.broker === "IBKR" && account.externalAccountId && (
                      <>
                        <span className="text-edge">·</span>
                        <span className="font-mono">
                          {account.externalAccountId}
                        </span>
                      </>
                    )}
                    <span className="text-edge">·</span>
                    <span className="font-mono">{account.baseCurrency}</span>
                    {account.broker === "IBKR" && (
                      <>
                        <span className="text-edge">·</span>
                        <span>
                          Sync{" "}
                          {lastSync
                            ? formatDateTime(new Date(lastSync))
                            : "jamais"}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
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
                            "Connexion vérifiée sur tous les rapports."
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
                                headers: {
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                  accountId: account.id,
                                }),
                              }),
                            "Sync terminée."
                          )
                        }
                      >
                        {busy === `sync:${account.id}`
                          ? "Sync…"
                          : "Synchroniser"}
                      </button>
                    </>
                  )}
                  <button
                    aria-label={`Supprimer ${account.label}`}
                    className={`${btnClass} px-2 hover:border-loss/50 hover:text-loss`}
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
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        <div className="text-[10px] font-bold uppercase tracking-[.09em] text-ink-mute">
          Ajouter un connecteur
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <button
            onClick={() => setWizard("manual")}
            className="flex cursor-pointer flex-col gap-3 rounded-xl border border-edge bg-surface p-4 text-left transition-colors hover:border-accent/50"
          >
            <div className="flex w-full items-center justify-between">
              <PlatformLogo platform="MANUAL" />
              <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-accent">
                RECOMMANDÉ
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold">Saisie manuelle</span>
              <span className="text-xs leading-relaxed text-ink-soft">
                Enregistrez vos ordres à la main depuis le Journal. Aucune
                configuration requise.
              </span>
            </div>
          </button>

          <button
            onClick={() => setWizard("ibkr")}
            className="flex cursor-pointer flex-col gap-3 rounded-xl border border-edge bg-surface p-4 text-left transition-colors hover:border-accent/50"
          >
            <PlatformLogo platform="IBKR" />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold">Interactive Brokers</span>
              <span className="text-xs leading-relaxed text-ink-soft">
                Importez automatiquement vos exécutions chaque nuit via vos
                relevés de compte.
              </span>
            </div>
          </button>

          <div className="flex cursor-not-allowed flex-col gap-3 rounded-xl border border-edge-soft bg-surface/50 p-4 opacity-50">
            <div className="flex w-full items-center justify-between">
              <PlatformLogo platform="TRADE_REPUBLIC" muted />
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-ink-mute">
                BIENTÔT
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-ink-soft">
                Trade Republic
              </span>
              <span className="text-xs leading-relaxed text-ink-mute">
                Import CSV de l&apos;historique d&apos;ordres. Bientôt
                disponible.
              </span>
            </div>
          </div>
        </div>
      </div>

      {wizard === "ibkr" && (
        <IbkrWizard
          onClose={() => setWizard(null)}
          onDone={(text) => {
            setWizard(null);
            setMessage({ kind: "ok", text });
            router.refresh();
          }}
        />
      )}
      {wizard === "manual" && (
        <ManualWizard
          onClose={() => setWizard(null)}
          onDone={(text) => {
            setWizard(null);
            setMessage({ kind: "ok", text });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/* ── Briques communes des wizards ─────────────────────────────────── */

function WizardModal({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-[520px] max-w-full flex-col overflow-hidden rounded-2xl border border-edge bg-surface shadow-2xl"
      >
        {children}
      </div>
    </div>
  );
}

function WizardHeader({
  platform,
  title,
  subtitle,
  onClose,
}: {
  platform: "IBKR" | "MANUAL";
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-edge-soft px-5 py-4">
      <div className="flex items-center gap-2.5">
        <PlatformLogo platform={platform} size={32} />
        <div className="flex flex-col">
          <span className="text-sm font-semibold">{title}</span>
          {subtitle && (
            <span className="text-[11px] text-ink-mute">{subtitle}</span>
          )}
        </div>
      </div>
      <button
        aria-label="Fermer"
        onClick={onClose}
        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-ink-mute transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9.5px] font-bold uppercase tracking-[.07em] text-ink-mute">
      {children}
    </span>
  );
}

function HelpToggle({
  open,
  onToggle,
  label = "Aide",
}: {
  open: boolean;
  onToggle: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex cursor-pointer items-center gap-1 text-[11px] text-accent hover:underline"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" />
      </svg>
      {label}
    </button>
  );
}

function CurrencyPicker({
  value,
  onChange,
}: {
  value: "EUR" | "USD";
  onChange: (ccy: "EUR" | "USD") => void;
}) {
  return (
    <div className="flex gap-2">
      {(["EUR", "USD"] as const).map((ccy) => (
        <button
          key={ccy}
          type="button"
          onClick={() => onChange(ccy)}
          className={`flex-1 cursor-pointer rounded-lg border px-3 py-2.5 font-mono text-sm font-bold transition-colors ${
            value === ccy
              ? "border-accent/60 bg-accent/10 text-accent"
              : "border-edge bg-surface-2 text-ink-soft hover:border-accent/40"
          }`}
        >
          {ccy}
        </button>
      ))}
    </div>
  );
}

/* ── Wizard Interactive Brokers (4 étapes) ────────────────────────── */

type DraftTest = {
  ran: boolean;
  running: boolean;
  authFailed: boolean;
  byType: Record<string, { ok: boolean; error?: string }>;
};

const TEST_INITIAL: DraftTest = {
  ran: false,
  running: false,
  authFailed: false,
  byType: {},
};

function IbkrWizard({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [step, setStep] = useState(1);
  const [label, setLabel] = useState("");
  const [ccy, setCcy] = useState<"EUR" | "USD">("EUR");
  const [flexToken, setFlexToken] = useState("");
  const [execId, setExecId] = useState("");
  const [actId, setActId] = useState("");
  const [help, setHelp] = useState<"key" | "exec" | "act" | null>(null);
  const [test, setTest] = useState<DraftTest>(TEST_INITIAL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stepValid =
    (step !== 1 || label.trim().length > 0) &&
    (step !== 2 || flexToken.trim().length > 0) &&
    (step !== 3 || execId.trim().length > 0 || actId.trim().length > 0);

  const testAllOk =
    test.ran &&
    !test.running &&
    Object.values(test.byType).length > 0 &&
    Object.values(test.byType).every((r) => r.ok);

  async function runTest() {
    setTest({ ...TEST_INITIAL, running: true });
    setError(null);
    try {
      const res = await fetch("/api/accounts/test-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flexToken,
          queryIdTradeConfirms: execId,
          queryIdActivity: actId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setError(data.error ?? `Erreur HTTP ${res.status}`);
        setTest(TEST_INITIAL);
        return;
      }
      const byType: DraftTest["byType"] = {};
      let authFailed = false;
      for (const r of data.results ?? []) {
        byType[r.type] = { ok: r.ok, error: r.error };
        if (r.authError) authFailed = true;
      }
      setTest({ ran: true, running: false, authFailed, byType });
    } catch (e) {
      setError(String(e));
      setTest(TEST_INITIAL);
    }
  }

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          flexToken,
          queryIdTradeConfirms: execId,
          queryIdActivity: actId,
          baseCurrency: ccy,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setError(data.error ?? `Erreur HTTP ${res.status}`);
        return;
      }
      onDone(`Compte « ${label} » connecté. Lance une première sync.`);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const checks: {
    key: string;
    title: string;
    detail: string;
    state: { label: string; className: string };
  }[] = [
    {
      key: "token",
      title: "Clé d'accès aux relevés",
      detail: "Authentification IBKR",
      state: !test.ran
        ? PENDING
        : test.authFailed
          ? failed("Invalide")
          : passed("Vérifiée"),
    },
    ...(execId.trim()
      ? [
          {
            key: "exec",
            title: "Rapport des exécutions",
            detail: "Trades de la journée",
            state: checkState(test, "TRADE_CONFIRMS"),
          },
        ]
      : []),
    ...(actId.trim()
      ? [
          {
            key: "act",
            title: "Rapport d'activité",
            detail: "Positions & P&L réalisé",
            state: checkState(test, "ACTIVITY"),
          },
        ]
      : []),
  ];

  return (
    <WizardModal onClose={onClose}>
      <WizardHeader
        platform="IBKR"
        title="Interactive Brokers"
        subtitle={`Étape ${step} sur 4`}
        onClose={onClose}
      />
      <div className="flex shrink-0 gap-1 px-5 pt-3">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={`h-0.5 flex-1 rounded-full ${
              s <= step ? "bg-accent" : "bg-edge"
            }`}
          />
        ))}
      </div>

      <div className="flex flex-col gap-4 overflow-y-auto p-5">
        {error && (
          <p className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
            {error}
          </p>
        )}

        {step === 1 && (
          <>
            <div className="flex flex-col gap-0.5">
              <span className="text-base font-semibold">Votre compte</span>
              <span className="text-xs text-ink-soft">
                Donnez un nom à ce compte pour le retrouver facilement.
              </span>
            </div>
            <label className="flex flex-col gap-1.5">
              <FieldLabel>Libellé du compte</FieldLabel>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="ex. IBKR Principal"
                className={inputClass}
                autoFocus
              />
            </label>
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Devise de base</FieldLabel>
              <CurrencyPicker value={ccy} onChange={setCcy} />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <span className="text-base font-semibold">
              Autoriser l&apos;accès
            </span>
            <div className="flex items-start gap-3 rounded-lg border border-accent/20 bg-accent/5 px-4 py-3">
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="mt-0.5 shrink-0 text-accent"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span className="text-xs leading-relaxed text-ink-soft">
                Alert Desk lit vos relevés de compte, rien d&apos;autre. Il ne
                peut ni passer d&apos;ordre, ni déplacer d&apos;argent — accès
                lecture seule. Votre clé est chiffrée et stockée uniquement sur
                votre serveur.
              </span>
            </div>
            <label className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <FieldLabel>Clé d&apos;accès aux relevés</FieldLabel>
                <HelpToggle
                  open={help === "key"}
                  onToggle={() => setHelp(help === "key" ? null : "key")}
                  label="Où trouver cette clé ?"
                />
              </div>
              <input
                type="password"
                value={flexToken}
                onChange={(e) => setFlexToken(e.target.value)}
                placeholder="••••••••••••••••••••••••"
                className={`${inputClass} font-mono`}
                autoFocus
              />
              {help === "key" && (
                <div className="flex flex-col gap-2 rounded-lg border border-edge-soft bg-surface-2/50 p-3.5 text-xs leading-relaxed text-ink-mute">
                  <span className="font-semibold text-ink-soft">
                    Comment trouver votre clé d&apos;accès
                  </span>
                  <ol className="list-inside list-decimal space-y-1">
                    <li>
                      Connectez-vous au{" "}
                      <span className="text-ink-soft">Client Portal</span> IBKR
                    </li>
                    <li>
                      Allez dans{" "}
                      <span className="text-ink-soft">
                        Performance &amp; Reports → Flex Queries
                      </span>
                    </li>
                    <li>
                      Copiez le token du{" "}
                      <span className="text-ink-soft">Flex Web Service</span>{" "}
                      affiché en haut de la page
                    </li>
                  </ol>
                </div>
              )}
            </label>
          </>
        )}

        {step === 3 && (
          <>
            <div className="flex flex-col gap-0.5">
              <span className="text-base font-semibold">Vos rapports</span>
              <span className="text-xs text-ink-soft">
                Ces rapports permettent à Alert Desk de lire vos exécutions et
                votre P&amp;L réalisé. Renseignez-en au moins un.
              </span>
            </div>
            <label className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <FieldLabel>Rapport des exécutions (journée)</FieldLabel>
                <HelpToggle
                  open={help === "exec"}
                  onToggle={() => setHelp(help === "exec" ? null : "exec")}
                />
              </div>
              <input
                value={execId}
                onChange={(e) => setExecId(e.target.value)}
                placeholder="ex. 123456"
                className={`${inputClass} font-mono`}
                autoFocus
              />
              {help === "exec" && (
                <div className="rounded-lg border border-edge-soft bg-surface-2/50 p-3 text-xs leading-relaxed text-ink-mute">
                  Dans Flex Queries, créez ou sélectionnez une requête de type{" "}
                  <span className="italic text-ink-soft">
                    Trade Confirmation
                  </span>
                  . L&apos;identifiant numérique (Query ID) de cette requête est
                  à renseigner ici.
                </div>
              )}
            </label>
            <label className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <FieldLabel>Rapport d&apos;activité (nuit)</FieldLabel>
                <HelpToggle
                  open={help === "act"}
                  onToggle={() => setHelp(help === "act" ? null : "act")}
                />
              </div>
              <input
                value={actId}
                onChange={(e) => setActId(e.target.value)}
                placeholder="ex. 789012"
                className={`${inputClass} font-mono`}
              />
              {help === "act" && (
                <div className="rounded-lg border border-edge-soft bg-surface-2/50 p-3 text-xs leading-relaxed text-ink-mute">
                  Requête de type{" "}
                  <span className="italic text-ink-soft">Account Activity</span>
                  . Elle doit inclure le P&amp;L réalisé — activez la section{" "}
                  <span className="text-ink-soft">
                    Realized P&amp;L by Tax Lot
                  </span>{" "}
                  dans les options de la requête.
                </div>
              )}
            </label>
          </>
        )}

        {step === 4 && (
          <>
            <div className="flex flex-col gap-0.5">
              <span className="text-base font-semibold">Vérification</span>
              <span className="text-xs text-ink-soft">
                Alert Desk teste la connexion avec vos paramètres.
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {checks.map((c) => (
                <div
                  key={c.key}
                  className="flex items-center justify-between rounded-lg border border-edge-soft bg-surface-2/50 px-3.5 py-3"
                >
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-ink">
                      {c.title}
                    </span>
                    <span className="text-[10.5px] text-ink-mute">
                      {c.detail}
                    </span>
                  </div>
                  <span
                    className={`rounded border px-2 py-0.5 text-[10.5px] font-bold ${c.state.className}`}
                  >
                    {c.state.label}
                  </span>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={runTest}
              disabled={test.running}
              className={`${btnClass} flex items-center gap-2 self-start px-4 py-2`}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={test.running ? "animate-spin" : ""}
              >
                <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
              </svg>
              {test.running
                ? "Test en cours…"
                : test.ran
                  ? "Relancer le test"
                  : "Lancer le test"}
            </button>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-edge-soft px-5 py-3.5">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => {
              setStep(step - 1);
              setError(null);
            }}
            className={`${btnClass} px-4 py-2 text-sm`}
          >
            Retour
          </button>
        ) : (
          <span />
        )}
        {step < 4 ? (
          <button
            type="button"
            disabled={!stepValid}
            onClick={() => {
              setStep(step + 1);
              setHelp(null);
              setError(null);
            }}
            className={primaryBtnClass}
          >
            Continuer
          </button>
        ) : (
          <button
            type="button"
            disabled={!testAllOk || saving}
            title={
              testAllOk
                ? undefined
                : "Lance d'abord un test de connexion réussi"
            }
            onClick={finish}
            className={primaryBtnClass}
          >
            {saving ? "Création…" : "Terminer"}
          </button>
        )}
      </div>
    </WizardModal>
  );
}

const PENDING = {
  label: "EN ATTENTE",
  className: "text-ink-mute border-edge bg-surface-2",
};
const passed = (label: string) => ({
  label,
  className: "text-accent border-accent/30 bg-accent/10",
});
const failed = (label: string) => ({
  label,
  className: "text-warn border-warn/30 bg-warn/10",
});

function checkState(test: DraftTest, type: string) {
  if (!test.ran) return PENDING;
  const r = test.byType[type];
  if (!r) return PENDING;
  return r.ok ? passed("OK") : failed("ERREUR");
}

/* ── Wizard Saisie manuelle (un seul écran) ───────────────────────── */

function ManualWizard({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [ccy, setCcy] = useState<"EUR" | "USD">("EUR");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broker: "MANUAL", label, baseCurrency: ccy }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setError(data.error ?? `Erreur HTTP ${res.status}`);
        return;
      }
      onDone(
        `Compte « ${label} » créé. Saisis ton premier ordre depuis le Journal.`
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <WizardModal onClose={onClose}>
      <WizardHeader
        platform="MANUAL"
        title="Saisie manuelle"
        onClose={onClose}
      />
      <div className="flex flex-col gap-4 p-5">
        {error && (
          <p className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
            {error}
          </p>
        )}
        <div className="rounded-lg border border-accent/20 bg-accent/5 px-4 py-3 text-xs leading-relaxed text-ink-soft">
          Avec la saisie manuelle, vous enregistrez vos ordres directement
          depuis le Journal. Aucune connexion à un courtier n&apos;est
          nécessaire.
        </div>
        <label className="flex flex-col gap-1.5">
          <FieldLabel>Libellé du compte</FieldLabel>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="ex. Compte principal"
            className={inputClass}
            autoFocus
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Devise de base</FieldLabel>
          <CurrencyPicker value={ccy} onChange={setCcy} />
        </div>
      </div>
      <div className="flex shrink-0 justify-end border-t border-edge-soft px-5 py-3.5">
        <button
          type="button"
          disabled={!label.trim() || saving}
          onClick={create}
          className={primaryBtnClass}
        >
          {saving ? "Création…" : "Créer le compte"}
        </button>
      </div>
    </WizardModal>
  );
}
