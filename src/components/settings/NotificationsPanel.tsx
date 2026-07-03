"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface ChannelsState {
  telegram: { configured: boolean; botConfigured: boolean };
  discord: { configured: boolean };
}

export function NotificationsPanel({ channels }: { channels: ChannelsState }) {
  const router = useRouter();
  const [telegramChatId, setTelegramChatId] = useState("");
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  async function save(payload: Record<string, string>) {
    setBusy("save");
    setMessage(null);
    const res = await fetch("/api/notifications/channels", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setMessage(
      res.ok
        ? { kind: "ok", text: "Canal enregistré (chiffré en base)." }
        : { kind: "error", text: data.error ?? `Erreur HTTP ${res.status}` }
    );
    setBusy(null);
    setTelegramChatId("");
    setDiscordWebhookUrl("");
    router.refresh();
  }

  async function test() {
    setBusy("test");
    setMessage(null);
    const res = await fetch("/api/notifications/test", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage({ kind: "error", text: data.error ?? "Erreur de test" });
    } else {
      const parts = Object.entries(
        (data.deliveries ?? {}) as Record<string, { ok: boolean; error?: string }>
      ).map(([channel, r]) =>
        r.ok ? `${channel} : reçu ✓` : `${channel} : échec (${r.error})`
      );
      const allOk = parts.every((p) => p.includes("✓"));
      setMessage({
        kind: allOk ? "ok" : "error",
        text: parts.join(" · ") || "aucun canal",
      });
    }
    setBusy(null);
  }

  const inputClass =
    "w-full rounded-lg border border-edge bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent/60";

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

      <div className="rounded-xl border border-edge bg-surface p-4">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-sm font-semibold">Telegram</h3>
          {channels.telegram.configured && (
            <span className="rounded border border-gain/30 bg-gain/10 px-1.5 py-px text-[10px] font-semibold text-gain">
              Configuré
            </span>
          )}
          {!channels.telegram.botConfigured && (
            <span className="rounded border border-warn/30 bg-warn/10 px-1.5 py-px text-[10px] font-semibold text-warn">
              TELEGRAM_BOT_TOKEN absent du .env
            </span>
          )}
        </div>
        <p className="mb-3 text-xs text-ink-mute">
          Crée un bot via @BotFather, mets son token dans le .env du serveur,
          démarre une conversation avec lui, puis renseigne ton chat id
          (récupérable via @userinfobot).
        </p>
        <div className="flex gap-2">
          <input
            value={telegramChatId}
            onChange={(e) => setTelegramChatId(e.target.value)}
            placeholder={
              channels.telegram.configured
                ? "•••••• (remplacer, ou « - » pour supprimer)"
                : "Chat ID (ex. 123456789)"
            }
            className={inputClass}
          />
          <button
            disabled={busy !== null || !telegramChatId.trim()}
            onClick={() =>
              save({
                telegramChatId:
                  telegramChatId.trim() === "-" ? "" : telegramChatId.trim(),
              })
            }
            className="cursor-pointer whitespace-nowrap rounded-lg bg-accent/15 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/25 disabled:opacity-50"
          >
            Enregistrer
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-edge bg-surface p-4">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-sm font-semibold">Discord</h3>
          {channels.discord.configured && (
            <span className="rounded border border-gain/30 bg-gain/10 px-1.5 py-px text-[10px] font-semibold text-gain">
              Configuré
            </span>
          )}
        </div>
        <p className="mb-3 text-xs text-ink-mute">
          Paramètres du salon → Intégrations → Webhooks → copier l&apos;URL.
        </p>
        <div className="flex gap-2">
          <input
            value={discordWebhookUrl}
            onChange={(e) => setDiscordWebhookUrl(e.target.value)}
            placeholder={
              channels.discord.configured
                ? "•••••• (remplacer, ou « - » pour supprimer)"
                : "https://discord.com/api/webhooks/…"
            }
            className={inputClass}
          />
          <button
            disabled={busy !== null || !discordWebhookUrl.trim()}
            onClick={() =>
              save({
                discordWebhookUrl:
                  discordWebhookUrl.trim() === "-"
                    ? ""
                    : discordWebhookUrl.trim(),
              })
            }
            className="cursor-pointer whitespace-nowrap rounded-lg bg-accent/15 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/25 disabled:opacity-50"
          >
            Enregistrer
          </button>
        </div>
      </div>

      <button
        onClick={test}
        disabled={busy !== null}
        className="cursor-pointer self-start rounded-lg border border-edge bg-surface-2 px-4 py-2 text-sm font-medium hover:border-accent/50 disabled:opacity-50"
      >
        {busy === "test" ? "Envoi…" : "Envoyer un message de test"}
      </button>
    </div>
  );
}
