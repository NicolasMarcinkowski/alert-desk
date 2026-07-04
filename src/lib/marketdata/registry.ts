/**
 * Registry des providers par priorité : Finnhub (live, si clé) puis Yahoo
 * (différé, keyless). Le provider IBKR gateway (v2) se préfixera ici.
 */

import { FinnhubProvider } from "./finnhub";
import { YahooProvider } from "./yahoo";
import type { MarketDataProvider, Quote, SymbolRef } from "./types";

interface Registry {
  providers: MarketDataProvider[];
  finnhub: FinnhubProvider | null;
}

function buildRegistry(): Registry {
  const providers: MarketDataProvider[] = [];
  let finnhub: FinnhubProvider | null = null;

  const apiKey = process.env.FINNHUB_API_KEY;
  if (apiKey) {
    finnhub = new FinnhubProvider(apiKey);
    providers.push(finnhub);
  }
  providers.push(new YahooProvider());

  return { providers, finnhub };
}

const globalRef = globalThis as unknown as { __alertDeskMdRegistry?: Registry };
const registry = globalRef.__alertDeskMdRegistry ?? buildRegistry();
globalRef.__alertDeskMdRegistry = registry;

export function getProvider(ref: SymbolRef): MarketDataProvider | null {
  return registry.providers.find((p) => p.supports(ref)) ?? null;
}

/** Cascade : premier provider compétent qui répond non-null (Finnhub → Yahoo). */
export async function fetchQuote(ref: SymbolRef): Promise<Quote | null> {
  for (const provider of registry.providers) {
    if (!provider.supports(ref)) continue;
    try {
      const quote = await provider.getQuote(ref);
      if (quote) return quote;
    } catch {
      // provider suivant
    }
  }
  return null;
}

/** Provider Finnhub (websocket + meta) si une clé est configurée. */
export function getFinnhub(): FinnhubProvider | null {
  return registry.finnhub;
}
