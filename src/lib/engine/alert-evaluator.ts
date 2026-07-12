/**
 * Évaluateur d'alertes — branché sur chaque tick du cache de quotes.
 *
 * Anti double-fire : le déclenchement est un `updateMany` conditionné à
 * state=ARMED (0 ligne modifiée = un autre tick a déjà tiré). La
 * notification part APRÈS l'écriture d'état : un crash entre les deux perd
 * au pire une notification, jamais de doublon (l'AlertEvent aux
 * `deliveries` vides le rend visible).
 *
 * Machine à états : ARMED → TRIGGERED (fire + event) → selon rearmMode :
 *  - MANUAL             : reste TRIGGERED jusqu'au réarmement utilisateur
 *  - AUTO_AFTER_COOLDOWN: COOLDOWN → ARMED quand rearmAt est passé
 *  - AUTO_ON_RECROSS    : COOLDOWN → ARMED quand rearmAt est passé ET que la
 *    condition a été observée fausse au moins une fois (pas de spam quand le
 *    prix stagne au-dessus du seuil). L'observation est en mémoire : après un
 *    restart, il faut au pire une observation fausse de plus — sûr.
 */

import { prisma } from "@/lib/db/client";
import type {
  AlertRuleType,
  AlertState,
  Prisma,
  RearmMode,
} from "@/generated/prisma";
import { dispatchToUser } from "@/lib/notify/dispatch";
import { formatSignedMoney } from "@/lib/utils/format";
import type { Quote } from "@/lib/marketdata/types";
import { sseHub } from "./sse-hub";

export interface EvaluatorPosition {
  /** Clé du cache de quotes */
  key: string;
  brokerAccountId: string;
  instrumentId: string;
  quantity: number;
  avgCost: number;
  multiplier: number;
  fxRateToBase: number;
  displayLabel: string;
}

interface RuleRuntime {
  id: string;
  userId: string;
  type: AlertRuleType;
  threshold: number;
  state: AlertState;
  rearmMode: RearmMode;
  cooldownSeconds: number;
  rearmAtMs: number | null;
  notifyTelegram: boolean;
  notifyDiscord: boolean;
  symbolKey: string;
  displayLabel: string;
  position?: EvaluatorPosition;
}

interface EvaluatorState {
  rulesBySymbol: Map<string, RuleRuntime[]>;
  recrossSeen: Set<string>;
}

const globalRef = globalThis as unknown as {
  __alertDeskEvaluator?: EvaluatorState;
};

function state(): EvaluatorState {
  if (!globalRef.__alertDeskEvaluator) {
    globalRef.__alertDeskEvaluator = {
      rulesBySymbol: new Map(),
      recrossSeen: new Set(),
    };
  }
  return globalRef.__alertDeskEvaluator;
}

/** Recharge les règles actives (appelé au refresh 60 s et après mutation). */
export async function loadAlertRules(
  positions: EvaluatorPosition[]
): Promise<void> {
  const rules = await prisma.alertRule.findMany({
    where: { state: { not: "DISABLED" } },
    include: { instrument: { select: { id: true } } },
  });

  // Clé compte+instrument : deux utilisateurs peuvent détenir le même
  // instrument — une règle ne doit évaluer QUE la position de son compte.
  const byAccountInstrument = new Map(
    positions.map((p) => [`${p.brokerAccountId}:${p.instrumentId}`, p])
  );
  const map = new Map<string, RuleRuntime[]>();

  for (const rule of rules) {
    let symbolKey: string | null = null;
    let displayLabel = rule.symbol ?? "";
    let position: EvaluatorPosition | undefined;

    if (rule.type === "POSITION_PNL_ABOVE" || rule.type === "POSITION_PNL_BELOW") {
      if (!rule.instrumentId || !rule.brokerAccountId) continue;
      position = byAccountInstrument.get(
        `${rule.brokerAccountId}:${rule.instrumentId}`
      );
      // Pas de position ouverte sur l'instrument → règle dormante
      if (!position) continue;
      symbolKey = position.key;
      displayLabel = position.displayLabel;
    } else if (rule.symbol) {
      symbolKey = rule.symbol;
    }
    if (!symbolKey) continue;

    const runtime: RuleRuntime = {
      id: rule.id,
      userId: rule.userId,
      type: rule.type,
      threshold: Number(rule.threshold),
      state: rule.state,
      rearmMode: rule.rearmMode,
      cooldownSeconds: rule.cooldownSeconds,
      rearmAtMs: rule.rearmAt?.getTime() ?? null,
      notifyTelegram: rule.notifyTelegram,
      notifyDiscord: rule.notifyDiscord,
      symbolKey,
      displayLabel,
      position,
    };
    const list = map.get(symbolKey) ?? [];
    list.push(runtime);
    map.set(symbolKey, list);
  }

  state().rulesBySymbol = map;
}

/** Symboles requis par les règles de prix (à ajouter aux souscriptions). */
export async function alertSymbols(): Promise<string[]> {
  const rules = await prisma.alertRule.findMany({
    where: { state: { not: "DISABLED" }, symbol: { not: null } },
    select: { symbol: true },
  });
  return [...new Set(rules.map((r) => r.symbol!))];
}

function computeCondition(
  rule: RuleRuntime,
  quote: Quote
): { value: number; condition: boolean } | null {
  switch (rule.type) {
    case "PRICE_ABOVE":
      return { value: quote.last, condition: quote.last >= rule.threshold };
    case "PRICE_BELOW":
      return { value: quote.last, condition: quote.last <= rule.threshold };
    case "PCT_CHANGE_DAY": {
      if (quote.dayChangePct == null) return null;
      // Amplitude : déclenche à la hausse comme à la baisse
      return {
        value: quote.dayChangePct,
        condition: Math.abs(quote.dayChangePct) >= Math.abs(rule.threshold),
      };
    }
    case "POSITION_PNL_ABOVE":
    case "POSITION_PNL_BELOW": {
      const p = rule.position;
      if (!p) return null;
      const pnlBase =
        (quote.last - p.avgCost) * p.quantity * p.multiplier * p.fxRateToBase;
      return {
        value: pnlBase,
        condition:
          rule.type === "POSITION_PNL_ABOVE"
            ? pnlBase >= rule.threshold
            : pnlBase <= rule.threshold,
      };
    }
  }
}

function buildMessage(rule: RuleRuntime, value: number): string {
  const th = rule.threshold;
  switch (rule.type) {
    case "PRICE_ABOVE":
      return `ALERT DESK — ${rule.displayLabel} a franchi ↑ ${th} (cours ${value.toFixed(2)})`;
    case "PRICE_BELOW":
      return `ALERT DESK — ${rule.displayLabel} a franchi ↓ ${th} (cours ${value.toFixed(2)})`;
    case "PCT_CHANGE_DAY":
      return `ALERT DESK — ${rule.displayLabel} bouge de ${value.toFixed(1)} % aujourd'hui (seuil ±${Math.abs(th)} %)`;
    case "POSITION_PNL_ABOVE":
      return `ALERT DESK — P&L latent ${rule.displayLabel} : ${formatSignedMoney(value)} (seuil ${formatSignedMoney(th)})`;
    case "POSITION_PNL_BELOW":
      return `ALERT DESK — P&L latent ${rule.displayLabel} : ${formatSignedMoney(value)} (seuil ${formatSignedMoney(th)})`;
  }
}

async function fire(rule: RuleRuntime, value: number): Promise<void> {
  const rearmAt = new Date(Date.now() + rule.cooldownSeconds * 1000);
  const res = await prisma.alertRule.updateMany({
    where: { id: rule.id, state: "ARMED" },
    data: {
      state: "TRIGGERED",
      lastTriggeredAt: new Date(),
      lastValue: value.toFixed(6),
      rearmAt,
    },
  });
  if (res.count === 0) return; // un autre tick a déjà tiré

  rule.state = "TRIGGERED";
  rule.rearmAtMs = rearmAt.getTime();

  const message = buildMessage(rule, value);
  const event = await prisma.alertEvent.create({
    data: {
      alertRuleId: rule.id,
      observedValue: value.toFixed(6),
      message,
    },
  });

  sseHub.sendToUser(rule.userId, "alert", {
    ruleId: rule.id,
    message,
    observedValue: value,
    triggeredAt: event.triggeredAt.toISOString(),
  });

  // État FINAL écrit AVANT le dispatch : l'envoi peut être long (retries,
  // canal muet) et un crash/redéploiement pendant cette fenêtre laisserait
  // sinon une règle AUTO bloquée en TRIGGERED pour toujours (jamais réévaluée).
  // Invariant 4 respecté : la notification part APRÈS l'écriture d'état.
  if (rule.rearmMode !== "MANUAL") {
    await prisma.alertRule.update({
      where: { id: rule.id },
      data: { state: "COOLDOWN" },
    });
    rule.state = "COOLDOWN";
    state().recrossSeen.delete(rule.id);
  }

  const deliveries = await dispatchToUser(
    rule.userId,
    { telegram: rule.notifyTelegram, discord: rule.notifyDiscord },
    message
  );
  await prisma.alertEvent.update({
    where: { id: event.id },
    data: { deliveries: deliveries as Prisma.InputJsonValue },
  });
}

async function evaluateRule(rule: RuleRuntime, quote: Quote): Promise<void> {
  const result = computeCondition(rule, quote);
  if (!result) return;
  const { value, condition } = result;

  if (rule.state === "ARMED") {
    if (condition) await fire(rule, value);
    return;
  }

  if (rule.state === "COOLDOWN") {
    if (!condition) state().recrossSeen.add(rule.id);
    const cooldownOver = rule.rearmAtMs !== null && Date.now() >= rule.rearmAtMs;
    const canRearm =
      cooldownOver &&
      (rule.rearmMode === "AUTO_AFTER_COOLDOWN" ||
        (rule.rearmMode === "AUTO_ON_RECROSS" &&
          state().recrossSeen.has(rule.id)));
    if (canRearm) {
      const res = await prisma.alertRule.updateMany({
        where: { id: rule.id, state: "COOLDOWN" },
        data: { state: "ARMED" },
      });
      if (res.count > 0) {
        rule.state = "ARMED";
        state().recrossSeen.delete(rule.id);
      }
    }
  }
  // MANUAL + TRIGGERED : rien — réarmement via /api/alerts/[id]/rearm
}

/** Point d'entrée branché sur quoteCache.on("quote") par le moteur. */
export function evaluateQuote(quote: Quote): void {
  const rules = state().rulesBySymbol.get(quote.symbol);
  if (!rules || rules.length === 0) return;
  for (const rule of rules) {
    void evaluateRule(rule, quote).catch((e) =>
      console.error(`[alerts] évaluation ${rule.id}:`, e)
    );
  }
}

export function evaluatorStatus() {
  const s = state();
  let ruleCount = 0;
  for (const list of s.rulesBySymbol.values()) ruleCount += list.length;
  return { watchedSymbols: s.rulesBySymbol.size, activeRules: ruleCount };
}
