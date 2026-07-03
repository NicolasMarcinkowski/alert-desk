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
import { sseHub } from "./sse-hub";

const REFRESH_SUBSCRIPTIONS_MS = 60_000;
const POLL_INTERVAL_MS = 30_000;
const WS_SLOTS = 50;

interface EngineState {
  started: boolean;
  startedAt: number | null;
  subscriptions: SymbolRef[];
  wsSymbols: string[];
  pollRefs: SymbolRef[];
  wsUnsubscribe: (() => void) | null;
  refreshTimer: ReturnType<typeof setInterval> | null;
  pollTimer: ReturnType<typeof setInterval> | null;
  lastTickAt: number | null;
  lastError: string | null;
}

const globalRef = globalThis as unknown as { __alertDeskEngine?: EngineState };

function state(): EngineState {
  if (!globalRef.__alertDeskEngine) {
    globalRef.__alertDeskEngine = {
      started: false,
      startedAt: null,
      subscriptions: [],
      wsSymbols: [],
      pollRefs: [],
      wsUnsubscribe: null,
      refreshTimer: null,
      pollTimer: null,
      lastTickAt: null,
      lastError: null,
    };
  }
  return globalRef.__alertDeskEngine;
}

function onQuote(quote: Quote): void {
  const s = state();
  s.lastTickAt = Date.now();
  quoteCache.set(quote);
}

/** positions ouvertes ∪ watchlists → refs de souscription dédupliquées. */
async function collectSubscriptions(): Promise<SymbolRef[]> {
  const [positions, watchlistItems] = await Promise.all([
    prisma.position.findMany({
      include: {
        instrument: {
          select: {
            symbol: true,
            secType: true,
            occSymbol: true,
            currency: true,
          },
        },
      },
    }),
    prisma.watchlistItem.findMany({ select: { symbol: true } }),
  ]);

  const refs = new Map<string, SymbolRef>();

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
  }
  // Priorité 2 : watchlists (actions par ticker)
  for (const item of watchlistItems) {
    const ref: SymbolRef = { kind: "STK", symbol: item.symbol };
    if (!refs.has(cacheKey(ref))) refs.set(cacheKey(ref), ref);
  }

  return Array.from(refs.values());
}

async function refreshSubscriptions(): Promise<void> {
  const s = state();
  try {
    const subs = await collectSubscriptions();
    s.subscriptions = subs;

    const finnhub = getFinnhub();
    const wsCandidates = finnhub
      ? subs.filter((r) => finnhub.supports(r)).slice(0, WS_SLOTS)
      : [];
    const wsSymbols = wsCandidates.map((r) => r.symbol);

    // Re-souscription websocket uniquement si le set change
    if (JSON.stringify(wsSymbols) !== JSON.stringify(s.wsSymbols)) {
      s.wsUnsubscribe?.();
      s.wsUnsubscribe =
        finnhub && wsCandidates.length > 0
          ? finnhub.subscribe(wsCandidates, onQuote)
          : null;
      s.wsSymbols = wsSymbols;
      // Priming REST : le websocket ne pousse pas de prevClose
      for (const ref of wsCandidates) {
        void fetchQuote(ref).then((q) => q && onQuote(q));
      }
    }

    const wsSet = new Set(wsSymbols);
    s.pollRefs = subs.filter(
      (r) => !wsSet.has(r.symbol) && getProvider(r) !== null
    );
    s.lastError = null;
  } catch (e) {
    s.lastError = e instanceof Error ? e.message : String(e);
  }
}

async function pollOnce(): Promise<void> {
  const s = state();
  for (const ref of s.pollRefs) {
    const quote = await fetchQuote(ref);
    if (quote) onQuote(quote);
  }
}

export function startEngine(): void {
  const s = state();
  if (s.started) return;
  s.started = true;
  s.startedAt = Date.now();

  // Fan-out SSE branché une seule fois sur le cache
  quoteCache.removeAllListeners("quote");
  quoteCache.on("quote", (q: Quote) => sseHub.broadcast("quote", q));

  void refreshSubscriptions().then(() => pollOnce());
  s.refreshTimer = setInterval(() => void refreshSubscriptions(), REFRESH_SUBSCRIPTIONS_MS);
  s.pollTimer = setInterval(() => void pollOnce(), POLL_INTERVAL_MS);

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
  };
}
