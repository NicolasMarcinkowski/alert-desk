/**
 * Fan-out des notifications d'alerte vers les canaux de l'utilisateur.
 * Chaque canal est tenté avec 2 retries (backoff court) ; le résultat
 * par canal est retourné pour être journalisé dans AlertEvent.deliveries.
 */

import { prisma } from "@/lib/db/client";
import { open } from "@/lib/crypto";
import { sendTelegram } from "./telegram";
import { sendDiscord } from "./discord";

export interface DeliveryResult {
  ok: boolean;
  error?: string;
  at: string;
}

export type Deliveries = Partial<Record<"telegram" | "discord", DeliveryResult>>;

const RETRY_DELAYS_MS = [1_000, 3_000];

async function withRetries(
  send: () => Promise<{ ok: boolean; error?: string }>
): Promise<DeliveryResult> {
  let last: { ok: boolean; error?: string } = { ok: false, error: "non tenté" };
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    last = await send();
    if (last.ok) break;
    if (attempt < RETRY_DELAYS_MS.length) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
  return { ...last, at: new Date().toISOString() };
}

/**
 * Envoie `text` sur les canaux demandés par la règle (flags notifyTelegram /
 * notifyDiscord) parmi les canaux configurés ET actifs de l'utilisateur.
 */
export async function dispatchToUser(
  userId: string,
  flags: { telegram: boolean; discord: boolean },
  text: string
): Promise<Deliveries> {
  const channels = await prisma.notificationChannel.findMany({
    where: { userId, enabled: true },
  });

  const deliveries: Deliveries = {};

  for (const channel of channels) {
    try {
      const config = JSON.parse(open(channel.configEncrypted)) as Record<
        string,
        string
      >;
      if (channel.type === "TELEGRAM" && flags.telegram && config.chatId) {
        deliveries.telegram = await withRetries(() =>
          sendTelegram(config.chatId, text)
        );
      }
      if (channel.type === "DISCORD" && flags.discord && config.webhookUrl) {
        deliveries.discord = await withRetries(() =>
          sendDiscord(config.webhookUrl, text)
        );
      }
    } catch (e) {
      const result: DeliveryResult = {
        ok: false,
        error: `config illisible: ${e instanceof Error ? e.message : String(e)}`,
        at: new Date().toISOString(),
      };
      if (channel.type === "TELEGRAM") deliveries.telegram = result;
      else deliveries.discord = result;
    }
  }

  return deliveries;
}
