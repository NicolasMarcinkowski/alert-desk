/**
 * Couche market data — interface commune à tous les fournisseurs.
 * Un provider qui ne sait pas servir un symbole répond `supports() === false`
 * plutôt que de servir une donnée fausse.
 */

export interface SymbolRef {
  kind: "STK" | "OPT";
  /** Ticker (STK) ou symbole OCC compact (OPT) — sert aussi de clé de cache */
  symbol: string;
  occSymbol?: string;
  currency?: string;
}

export interface Quote {
  /** Clé de cache : ticker STK ou OCC compact OPT */
  symbol: string;
  last: number;
  prevClose?: number;
  dayChangePct?: number;
  /** epoch ms */
  ts: number;
  /** true = donnée différée (Yahoo ~15 min, etc.) */
  delayed: boolean;
  source: string;
}

export interface SymbolMeta {
  name?: string;
  high52?: number;
  low52?: number;
}

export interface MarketDataProvider {
  readonly name: string;
  supports(ref: SymbolRef): boolean;
  /** null = symbole inconnu / pas de donnée */
  getQuote(ref: SymbolRef): Promise<Quote | null>;
  /** Souscription push (websocket) — optionnelle. Retourne un unsubscribe. */
  subscribe?(refs: SymbolRef[], onQuote: (q: Quote) => void): () => void;
}

export function cacheKey(ref: SymbolRef): string {
  return ref.kind === "OPT" ? (ref.occSymbol ?? ref.symbol) : ref.symbol;
}
