/**
 * Moteur in-process (un seul conteneur en prod) démarré par instrumentation.ts.
 *  - refresh du set de souscriptions toutes les 60 s :
 *    positions ouvertes ∪ items de watchlist (M3 : + symboles d'alertes)
 *  - les 50 slots websocket Finnhub vont en priorité aux positions,
 *    le reste (et toutes les options) est pollé en REST toutes les 30 s
 *  - chaque tick → quote-cache → fan-out SSE (M3 : + évaluateur d'alertes)
 */

import { prisma } from "@/lib/db/client";
import { quoteCache } from "@/lib/marketdata/quote-cache";
import { fetchQuote, getFinnhub, getProvider } from "@/lib/marketdata/registry";
import { cacheKey, type Quote, type SymbolRef } from "@/lib/marketdata/types";
import { fetchDailyBars } from "@/lib/marketdata/bars";
import { setBars, barsStale, pruneBars } from "@/lib/marketdata/bar-cache";
import { getOptionsAnalysis } from "@/lib/marketdata/options-chain";
import { formatOptionName } from "@/lib/utils/format";
import {
  alertSymbols,
  evaluateQuote,
  evaluatorStatus,
  indicatorSymbols,
  optionsAlertSymbols,
  loadAlertRules,
  type EvaluatorPosition,
} from "./alert-evaluator";
import { getUserSymbolKeys } from "./user-symbols";
import { sseHub } from "./sse-hub";

const REFRESH_SUBSCRIPTIONS_MS = 60_000;
const POLL_INTERVAL_MS = 30_000;
/** Les clôtures historiques ne bougent pas en séance → refetch au plus /6 h. */
const BARS_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** Coalescence des ticks : un broadcast SSE au plus toutes les 300 ms */
const SSE_FLUSH_MS = 300;
const WS_SLOTS = 50;

interface EngineState {
  started: boolean;
  startedAt: number | null;
  subscriptions: SymbolRef[];
  wsSymbols: string[];
  /** Symboles WS ayant réellement produit un tick Finnhub (sinon pollés) */
  wsAlive: Set<string>;
  pollRefs: SymbolRef[];
  wsUnsubscribe: (() => void) | null;
  refreshTimer: ReturnType<typeof setInterval> | null;
  pollTimer: ReturnType<typeof setInterval> | null;
  flushTimer: ReturnType<typeof setInterval> | null;
  /** Ticks en attente du prochain flush SSE (dernier tick par symbole) */
  tickBuffer: Map<string, Quote>;
  /** Re-priming REST quotidien des symboles websocket (prevClose frais) */
  lastPrimeDayUtc: string | null;
  lastTickAt: number | null;
  lastError: string | null;
  /** Verrou anti-chevauchement du polling REST (cycle > intervalle) */
  polling: boolean;
}

const globalRef = globalThis as unknown as { __alertDeskEngine?: EngineState };

function state(): EngineState {
  if (!globalRef.__alertDeskEngine) {
    globalRef.__alertDeskEngine = {
      started: false,
      startedAt: null,
      subscriptions: [],
      wsSymbols: [],
      wsAlive: new Set(),
      pollRefs: [],
      wsUnsubscribe: null,
      refreshTimer: null,
      pollTimer: null,
      flushTimer: null,
      tickBuffer: new Map(),
      lastPrimeDayUtc: null,
      lastTickAt: null,
      lastError: null,
      polling: false,
    };
  }
  return globalRef.__alertDeskEngine;
}

function onQuote(quote: Quote): void {
  const s = state();
  s.lastTickAt = Date.now();
  // Un tick/priming Finnhub prouve que le symbole WS est réellement servi ;
  // sinon (ex. place non-US que Finnhub ignore) il reste dans le poll de
  // secours et n'est jamais figé.
  if (quote.source === "finnhub" && s.wsSymbols.includes(quote.symbol)) {
    s.wsAlive.add(quote.symbol);
  }
  quoteCache.set(quote);
}

/** positions ∪ alertes ∪ watchlists → refs dédupliquées + positions pour l'évaluateur. */
async function collectSubscriptions(): Promise<{
  refs: SymbolRef[];
  evaluatorPositions: EvaluatorPosition[];
}> {
  const [positions, watchlistItems, ruleSymbols] = await Promise.all([
    prisma.position.findMany({
      include: {
        instrument: {
          select: {
            id: true,
            symbol: true,
            secType: true,
            occSymbol: true,
            currency: true,
            multiplier: true,
            underlyingSymbol: true,
            expiry: true,
            strike: true,
            putCall: true,
          },
        },
      },
    }),
    prisma.watchlistItem.findMany({ select: { symbol: true } }),
    alertSymbols(),
  ]);

  const refs = new Map<string, SymbolRef>();
  const evaluatorPositions: EvaluatorPosition[] = [];

  // Priorité 1 : positions (d'abord dans la liste → slots websocket)
  for (const p of positions) {
    const instr = p.instrument;
    const ref: SymbolRef =
      instr.secType === "OPT"
        ? {
            kind: "OPT",
            symbol: instr.occSymbol ?? instr.symbol,
            occSymbol: instr.occSymbol ?? undefined,
            currency: instr.currency,
          }
        : { kind: "STK", symbol: instr.symbol, currency: instr.currency };
    refs.set(cacheKey(ref), ref);
    evaluatorPositions.push({
      key: cacheKey(ref),
      brokerAccountId: p.brokerAccountId,
      instrumentId: instr.id,
      quantity: Number(p.quantity),
      avgCost: Number(p.avgCost),
      multiplier: Number(instr.multiplier),
      fxRateToBase: Number(p.fxRateToBase),
      displayLabel:
        instr.secType === "OPT" ? formatOptionName(instr) : instr.symbol,
    });
  }
  // Priorité 2 : symboles des règles d'alerte de prix
  for (const symbol of ruleSymbols) {
    const ref: SymbolRef = { kind: "STK", symbol };
    if (!refs.has(cacheKey(ref))) refs.set(cacheKey(ref), ref);
  }
  // Priorité 3 : watchlists (actions par ticker)
  for (const item of watchlistItems) {
    const ref: SymbolRef = { kind: "STK", symbol: item.symbol };
    if (!refs.has(cacheKey(ref))) refs.set(cacheKey(ref), ref);
  }

  return { refs: Array.from(refs.values()), evaluatorPositions };
}

/** Bougies journalières des symboles à alerte indicateur (fetch throttlé). */
async function refreshIndicatorBars(): Promise<void> {
  const symbols = await indicatorSymbols();
  pruneBars(new Set(symbols));
  for (const symbol of symbols) {
    if (!barsStale(symbol, BARS_MAX_AGE_MS)) continue;
    const bars = await fetchDailyBars(symbol);
    if (bars) setBars(symbol, bars);
  }
}

/** Analyse de chaîne d'options des symboles à alerte options (cache EOD). */
async function refreshOptionsAnalyses(): Promise<void> {
  const symbols = await optionsAlertSymbols();
  for (const symbol of symbols) {
    // getOptionsAnalysis gère son propre cache TTL ; on peuple juste le cache
    // que l'évaluateur lit ensuite en synchrone.
    await getOptionsAnalysis(symbol);
  }
}

async function refreshSubscriptions(): Promise<void> {
  const s = state();
  try {
    const { refs: subs, evaluatorPositions } = await collectSubscriptions();
    s.subscriptions = subs;
    await loadAlertRules(evaluatorPositions);
    // Bougies (analyse technique) + chaînes d'options (GEX/IV) en arrière-plan :
    // les alertes correspondantes restent dormantes tant que la donnée manque.
    void refreshIndicatorBars().catch(() => {});
    void refreshOptionsAnalyses().catch(() => {});

    const finnhub = getFinnhub();
    const wsCandidates = finnhub
      ? subs.filter((r) => finnhub.supports(r)).slice(0, WS_SLOTS)
      : [];
    const wsSymbols = wsCandidates.map((r) => r.symbol);

    const wsChanged =
      JSON.stringify(wsSymbols) !== JSON.stringify(s.wsSymbols);
    if (wsChanged) {
      s.wsUnsubscribe?.();
      s.wsUnsubscribe =
        finnhub && wsCandidates.length > 0
          ? finnhub.subscribe(wsCandidates, onQuote)
          : null;
      s.wsSymbols = wsSymbols;
      // Oublie les symboles retirés ; les nouveaux devront re-prouver un tick.
      const nextSet = new Set(wsSymbols);
      s.wsAlive = new Set([...s.wsAlive].filter((sym) => nextSet.has(sym)));
    }

    // Priming REST : le websocket ne pousse pas de prevClose — au premier
    // abonnement ET à chaque nouveau jour UTC (sinon dayChangePct et les
    // alertes PCT_CHANGE_DAY restent figés sur la clôture du premier jour)
    const todayUtc = new Date().toISOString().slice(0, 10);
    if (wsCandidates.length > 0 && (wsChanged || s.lastPrimeDayUtc !== todayUtc)) {
      s.lastPrimeDayUtc = todayUtc;
      for (const ref of wsCandidates) {
        void fetchQuote(ref).then((q) => q && onQuote(q));
      }
    }

    const wsSet = new Set(wsSymbols);
    // Poll REST : tout ce qui n'est pas WS, PLUS les symboles WS pas encore
    // confirmés par un tick Finnhub (secours contre les symboles jamais servis).
    s.pollRefs = subs.filter(
      (r) =>
        (!wsSet.has(r.symbol) || !s.wsAlive.has(r.symbol)) &&
        getProvider(r) !== null
    );

    // Rafraîchit les sets de symboles autorisés des clients SSE connectés
    for (const userId of sseHub.connectedUserIds()) {
      void getUserSymbolKeys(userId).then((keys) =>
        sseHub.setUserSymbols(userId, keys)
      );
    }
    s.lastError = null;
  } catch (e) {
    s.lastError = e instanceof Error ? e.message : String(e);
  }
}

async function pollOnce(): Promise<void> {
  const s = state();
  // Anti-chevauchement : si le cycle précédent (derrière le rate limiter)
  // dépasse POLL_INTERVAL_MS, on saute ce tick au lieu d'empiler des cycles.
  if (s.polling) return;
  s.polling = true;
  try {
    for (const ref of s.pollRefs) {
      const quote = await fetchQuote(ref);
      if (quote) onQuote(quote);
    }
  } finally {
    s.polling = false;
  }
}

export function startEngine(): void {
  const s = state();
  if (s.started) return;
  s.started = true;
  s.startedAt = Date.now();

  // Branché une seule fois sur le cache : alertes évaluées immédiatement,
  // ticks coalescés (dernier par symbole) pour le fan-out SSE
  quoteCache.removeAllListeners("quote");
  quoteCache.on("quote", (q: Quote) => {
    s.tickBuffer.set(q.symbol, q);
    evaluateQuote(q);
  });

  void refreshSubscriptions().then(() => pollOnce());
  s.refreshTimer = setInterval(() => void refreshSubscriptions(), REFRESH_SUBSCRIPTIONS_MS);
  s.pollTimer = setInterval(() => void pollOnce(), POLL_INTERVAL_MS);
  s.flushTimer = setInterval(() => {
    if (s.tickBuffer.size === 0) return;
    const batch = [...s.tickBuffer.values()];
    s.tickBuffer.clear();
    sseHub.broadcastQuotes(batch);
  }, SSE_FLUSH_MS);

  console.log("[engine] démarré (market data)");
}

/** À appeler après une mutation de watchlist / une sync (même process). */
export function requestSubscriptionRefresh(): void {
  if (!state().started) return;
  void refreshSubscriptions();
}

export function engineStatus() {
  const s = state();
  return {
    started: s.started,
    startedAt: s.startedAt,
    subscriptionCount: s.subscriptions.length,
    wsSymbols: s.wsSymbols.length,
    polledSymbols: s.pollRefs.length,
    cacheSize: quoteCache.size(),
    sseClients: sseHub.clientCount(),
    lastTickAt: s.lastTickAt,
    lastError: s.lastError,
    finnhubConfigured: getFinnhub() !== null,
    alerts: evaluatorStatus(),
  };
}
