/**
 * Cache de quotes en mémoire (pas de table — décision du plan : l'historique
 * des marks vient des PositionSnapshot). Émet "quote" à chaque mise à jour
 * pour le fan-out SSE et, en M3, l'évaluateur d'alertes.
 */

import { EventEmitter } from "events";
import type { Quote } from "./types";

class QuoteCache extends EventEmitter {
  private map = new Map<string, Quote>();

  set(quote: Quote): void {
    const existing = this.map.get(quote.symbol);
    // Un tick websocket sans prevClose hérite de celui déjà connu
    const merged: Quote = {
      ...quote,
      prevClose: quote.prevClose ?? existing?.prevClose,
      dayChangePct:
        quote.dayChangePct ??
        (quote.prevClose ?? existing?.prevClose
          ? ((quote.last - (quote.prevClose ?? existing!.prevClose!)) /
              (quote.prevClose ?? existing!.prevClose!)) *
            100
          : undefined),
    };
    this.map.set(quote.symbol, merged);
    this.emit("quote", merged);
  }

  get(symbol: string): Quote | undefined {
    return this.map.get(symbol);
  }

  snapshot(): Quote[] {
    return Array.from(this.map.values());
  }

  size(): number {
    return this.map.size;
  }
}

const globalRef = globalThis as unknown as { __alertDeskQuoteCache?: QuoteCache };
export const quoteCache = globalRef.__alertDeskQuoteCache ?? new QuoteCache();
globalRef.__alertDeskQuoteCache = quoteCache;
