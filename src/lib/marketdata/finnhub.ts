/**
 * Finnhub — actions US en temps réel.
 * Tier gratuit : 60 req/min REST + websocket 50 symboles.
 * Le websocket ne pousse que des trades (prix) : le prevClose vient du
 * priming REST et reste dans le cache.
 */

import { RateLimiter } from "./rate-limiter";
import type {
  MarketDataProvider,
  Quote,
  SymbolMeta,
  SymbolRef,
} from "./types";

const REST_BASE = "https://finnhub.io/api/v1";
const WS_URL = "wss://ws.finnhub.io";
const META_TTL_MS = 24 * 60 * 60 * 1000;

interface FinnhubTradeMsg {
  type: string;
  data?: { s: string; p: number; t: number }[];
}

export class FinnhubProvider implements MarketDataProvider {
  readonly name = "finnhub";
  private readonly limiter = new RateLimiter(55, 60_000);
  private readonly metaCache = new Map<
    string,
    { meta: SymbolMeta; at: number }
  >();

  constructor(private readonly apiKey: string) {}

  supports(ref: SymbolRef): boolean {
    return ref.kind === "STK" && (ref.currency ?? "USD") === "USD";
  }

  private async rest(path: string): Promise<Record<string, unknown> | null> {
    await this.limiter.acquire();
    const res = await fetch(`${REST_BASE}${path}&token=${this.apiKey}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  }

  async getQuote(ref: SymbolRef): Promise<Quote | null> {
    const data = await this.rest(`/quote?symbol=${encodeURIComponent(ref.symbol)}`);
    const last = Number(data?.c ?? 0);
    if (!data || last === 0) return null;
    return {
      symbol: ref.symbol,
      last,
      prevClose: Number(data.pc) || undefined,
      dayChangePct: data.dp != null ? Number(data.dp) : undefined,
      ts: data.t ? Number(data.t) * 1000 : Date.now(),
      delayed: false,
      source: this.name,
    };
  }

  /** Profil + bornes 52 semaines, cachés 24 h (enrichissement watchlist). */
  async getMeta(symbol: string): Promise<SymbolMeta | null> {
    const cached = this.metaCache.get(symbol);
    if (cached && Date.now() - cached.at < META_TTL_MS) return cached.meta;

    const [profile, metric] = await Promise.all([
      this.rest(`/stock/profile2?symbol=${encodeURIComponent(symbol)}`),
      this.rest(`/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all`),
    ]);
    const metrics = (metric?.metric ?? {}) as Record<string, unknown>;
    const meta: SymbolMeta = {
      name: typeof profile?.name === "string" ? profile.name : undefined,
      high52:
        metrics["52WeekHigh"] != null ? Number(metrics["52WeekHigh"]) : undefined,
      low52:
        metrics["52WeekLow"] != null ? Number(metrics["52WeekLow"]) : undefined,
    };
    this.metaCache.set(symbol, { meta, at: Date.now() });
    return meta;
  }

  subscribe(refs: SymbolRef[], onQuote: (q: Quote) => void): () => void {
    if (typeof WebSocket === "undefined" || refs.length === 0) {
      return () => {};
    }
    let ws: WebSocket | null = null;
    let closed = false;
    let retryDelay = 2_000;

    const connect = () => {
      if (closed) return;
      ws = new WebSocket(`${WS_URL}?token=${this.apiKey}`);
      ws.addEventListener("open", () => {
        retryDelay = 2_000;
        for (const ref of refs) {
          ws?.send(JSON.stringify({ type: "subscribe", symbol: ref.symbol }));
        }
      });
      ws.addEventListener("message", (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as FinnhubTradeMsg;
          if (msg.type !== "trade" || !msg.data) return;
          for (const t of msg.data) {
            onQuote({
              symbol: t.s,
              last: t.p,
              ts: t.t,
              delayed: false,
              source: this.name,
            });
          }
        } catch {
          // message non-JSON (ping) — ignoré
        }
      });
      ws.addEventListener("close", () => {
        if (closed) return;
        setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 60_000);
      });
      ws.addEventListener("error", () => {
        ws?.close();
      });
    };

    connect();
    return () => {
      closed = true;
      ws?.close();
    };
  }
}
