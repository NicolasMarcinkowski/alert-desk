/**
 * Yahoo Finance (endpoint chart v8, non officiel, sans clé) — fallback
 * différé (~15 min) : options via symbole OCC compact, et actions que
 * Finnhub ne couvre pas (pas de clé configurée, places non-US).
 *
 * Non officiel = peut casser : le provider répond null plutôt que de jeter,
 * l'UI affiche alors le dernier mark EOD.
 */

import { RateLimiter } from "./rate-limiter";
import type { MarketDataProvider, Quote, SymbolRef } from "./types";
import { cacheKey } from "./types";

const CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** Après un 429, on coupe le provider quelques minutes (disjoncteur). */
const BREAKER_COOLDOWN_MS = 5 * 60 * 1000;

export class YahooProvider implements MarketDataProvider {
  readonly name = "yahoo";
  private readonly limiter = new RateLimiter(30, 60_000);
  private breakerUntil = 0;

  supports(ref: SymbolRef): boolean {
    if (ref.kind === "OPT") return Boolean(ref.occSymbol);
    return true; // fallback actions (différé)
  }

  async getQuote(ref: SymbolRef): Promise<Quote | null> {
    if (Date.now() < this.breakerUntil) return null;
    const yahooSymbol = ref.kind === "OPT" ? ref.occSymbol! : ref.symbol;
    await this.limiter.acquire();
    try {
      const res = await fetch(
        `${CHART_BASE}/${encodeURIComponent(yahooSymbol)}?interval=1d&range=2d`,
        {
          headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
          cache: "no-store",
        }
      );
      if (res.status === 429) {
        this.breakerUntil = Date.now() + BREAKER_COOLDOWN_MS;
        return null;
      }
      if (!res.ok) return null;
      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      const last = Number(meta?.regularMarketPrice ?? 0);
      if (!meta || last === 0) return null;
      // previousClose = vraie clôture de la veille ; chartPreviousClose est
      // relatif au range (2d) → peut être à 2 séances et fausser le % du jour.
      const prevClose =
        Number(meta.previousClose ?? meta.chartPreviousClose ?? 0) || undefined;
      return {
        symbol: cacheKey(ref),
        last,
        prevClose,
        dayChangePct: prevClose
          ? ((last - prevClose) / prevClose) * 100
          : undefined,
        ts:
          meta.regularMarketTime != null
            ? Number(meta.regularMarketTime) * 1000
            : Date.now(),
        delayed: true,
        source: this.name,
      };
    } catch {
      return null;
    }
  }
}
