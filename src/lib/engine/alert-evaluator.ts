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
import { getBars } from "@/lib/marketdata/bar-cache";
import type { Bar } from "@/lib/marketdata/bars";
import { rsi, sma, highest, lowest } from "@/lib/indicators";
import { getCachedAnalysis } from "@/lib/marketdata/options-chain";
import { sseHub } from "./sse-hub";

/** Types d'alerte basés sur l'analyse de bougies (palier 1). */
const INDICATOR_TYPES: readonly AlertRuleType[] = [
  "RSI_BELOW",
  "RSI_ABOVE",
  "SMA_CROSS_UP",
  "SMA_CROSS_DOWN",
  "BREAKOUT_HIGH",
  "BREAKOUT_LOW",
];

/** Types d'alerte basés sur l'analyse de chaîne d'options (palier 2). */
const OPTION_TYPES: readonly AlertRuleType[] = [
  "IV_ABOVE",
  "IV_BELOW",
  "PUT_CALL_ABOVE",
  "GAMMA_FLIP_NEAR",
];

export function isIndicatorType(type: AlertRuleType): boolean {
  return INDICATOR_TYPES.includes(type);
}

export function isOptionType(type: AlertRuleType): boolean {
  return OPTION_TYPES.includes(type);
}

interface IndicatorParams {
  period?: number;
  fast?: number;
  slow?: number;
}

/** Séries de clôtures avec la bougie du jour remplacée par le dernier cours. */
function closesWithLive(bars: Bar[], last: number): number[] {
  const closes = bars.map((b) => b.c);
  if (closes.length === 0) return [last];
  const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  if (dayOf(bars[bars.length - 1].t) === dayOf(Date.now())) {
    closes[closes.length - 1] = last; // bougie du jour en formation
  } else {
    closes.push(last); // nouvelle séance pas encore dans le relevé
  }
  return closes;
}

/** Bougies déjà clôturées (exclut la bougie du jour en formation). */
function completedBars(bars: Bar[]): Bar[] {
  if (bars.length === 0) return bars;
  const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return dayOf(bars[bars.length - 1].t) === dayOf(Date.now())
    ? bars.slice(0, -1)
    : bars;
}

function clampInt(
  v: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

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
  params: IndicatorParams;
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

    const params: IndicatorParams =
      rule.params && typeof rule.params === "object" && !Array.isArray(rule.params)
        ? (rule.params as IndicatorParams)
        : {};

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
      params,
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

/** Symboles ayant une règle d'analyse technique (pour le fetch des bougies). */
export async function indicatorSymbols(): Promise<string[]> {
  const rules = await prisma.alertRule.findMany({
    where: {
      state: { not: "DISABLED" },
      symbol: { not: null },
      type: { in: [...INDICATOR_TYPES] },
    },
    select: { symbol: true },
  });
  return [...new Set(rules.map((r) => r.symbol!))];
}

/** Symboles ayant une règle options (pour le refresh de l'analyse de chaîne). */
export async function optionsAlertSymbols(): Promise<string[]> {
  const rules = await prisma.alertRule.findMany({
    where: {
      state: { not: "DISABLED" },
      symbol: { not: null },
      type: { in: [...OPTION_TYPES] },
    },
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
    case "RSI_BELOW":
    case "RSI_ABOVE": {
      const bars = getBars(rule.symbolKey);
      if (!bars) return null; // bougies pas encore chargées → dormant
      const value = rsi(
        closesWithLive(bars, quote.last),
        clampInt(rule.params.period, 2, 100, 14)
      );
      if (value == null) return null;
      return {
        value,
        condition:
          rule.type === "RSI_BELOW"
            ? value <= rule.threshold
            : value >= rule.threshold,
      };
    }
    case "SMA_CROSS_UP":
    case "SMA_CROSS_DOWN": {
      const bars = getBars(rule.symbolKey);
      if (!bars) return null;
      const fastP = clampInt(rule.params.fast, 2, 200, 9);
      const slowP = clampInt(rule.params.slow, 3, 400, 21);
      // Vrai CROISEMENT (pas un simple niveau) : on compare la relation
      // fast/slow d'AVANT (bougies clôturées) à celle de MAINTENANT (avec le
      // cours live). On ne tire que sur la bascule du signe de (fast - slow),
      // sinon une règle armée alors que fast>slow depuis longtemps tirerait
      // un faux « croisement » dès le 1er tick.
      const now = closesWithLive(bars, quote.last);
      const prev = completedBars(bars).map((b) => b.c);
      const fNow = sma(now, fastP);
      const sNow = sma(now, slowP);
      const fPrev = sma(prev, fastP);
      const sPrev = sma(prev, slowP);
      if (fNow == null || sNow == null || fPrev == null || sPrev == null) {
        return null;
      }
      const condition =
        rule.type === "SMA_CROSS_UP"
          ? fPrev <= sPrev && fNow > sNow
          : fPrev >= sPrev && fNow < sNow;
      return { value: fNow - sNow, condition };
    }
    case "BREAKOUT_HIGH":
    case "BREAKOUT_LOW": {
      const bars = getBars(rule.symbolKey);
      if (!bars) return null;
      const lookback = clampInt(rule.threshold, 2, 400, 20);
      // Niveau = extrême des séances DÉJÀ clôturées (hors bougie du jour)
      const completed = completedBars(bars);
      if (rule.type === "BREAKOUT_HIGH") {
        const level = highest(completed.map((b) => b.h), lookback);
        if (level == null) return null;
        return { value: quote.last, condition: quote.last >= level };
      }
      const level = lowest(completed.map((b) => b.l), lookback);
      if (level == null) return null;
      return { value: quote.last, condition: quote.last <= level };
    }
    case "IV_ABOVE":
    case "IV_BELOW": {
      const a = getCachedAnalysis(rule.symbolKey);
      if (!a || a.atmIv == null) return null; // chaîne pas encore chargée
      const ivPct = a.atmIv * 100;
      return {
        value: ivPct,
        condition:
          rule.type === "IV_ABOVE" ? ivPct >= rule.threshold : ivPct <= rule.threshold,
      };
    }
    case "PUT_CALL_ABOVE": {
      const a = getCachedAnalysis(rule.symbolKey);
      if (!a || a.putCallRatioOi == null) return null;
      return {
        value: a.putCallRatioOi,
        condition: a.putCallRatioOi >= rule.threshold,
      };
    }
    case "GAMMA_FLIP_NEAR": {
      const a = getCachedAnalysis(rule.symbolKey);
      if (!a || a.gammaFlip == null || quote.last <= 0) return null;
      const distPct = (Math.abs(quote.last - a.gammaFlip) / quote.last) * 100;
      return { value: distPct, condition: distPct <= rule.threshold };
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
    case "RSI_BELOW":
      return `ALERT DESK — ${rule.displayLabel} : RSI ${value.toFixed(0)} sous ${th} (survendu)`;
    case "RSI_ABOVE":
      return `ALERT DESK — ${rule.displayLabel} : RSI ${value.toFixed(0)} au-dessus de ${th} (suracheté)`;
    case "SMA_CROSS_UP":
      return `ALERT DESK — ${rule.displayLabel} : croisement MM haussier (MM${rule.params.fast ?? 9} > MM${rule.params.slow ?? 21})`;
    case "SMA_CROSS_DOWN":
      return `ALERT DESK — ${rule.displayLabel} : croisement MM baissier (MM${rule.params.fast ?? 9} < MM${rule.params.slow ?? 21})`;
    case "BREAKOUT_HIGH":
      return `ALERT DESK — ${rule.displayLabel} casse son plus-haut ${th} j (cours ${value.toFixed(2)})`;
    case "BREAKOUT_LOW":
      return `ALERT DESK — ${rule.displayLabel} casse son plus-bas ${th} j (cours ${value.toFixed(2)})`;
    case "IV_ABOVE":
      return `ALERT DESK — ${rule.displayLabel} IV ATM ${value.toFixed(1)} % ≥ ${th} %`;
    case "IV_BELOW":
      return `ALERT DESK — ${rule.displayLabel} IV ATM ${value.toFixed(1)} % ≤ ${th} %`;
    case "PUT_CALL_ABOVE":
      return `ALERT DESK — ${rule.displayLabel} put/call ${value.toFixed(2)} ≥ ${th}`;
    case "GAMMA_FLIP_NEAR":
      return `ALERT DESK — ${rule.displayLabel} à ${value.toFixed(2)} % du gamma flip (seuil ${th} %)`;
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
