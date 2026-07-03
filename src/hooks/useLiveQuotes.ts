"use client";

import { useEffect, useState } from "react";

export interface LiveQuote {
  symbol: string;
  last: number;
  prevClose?: number;
  dayChangePct?: number;
  ts: number;
  delayed: boolean;
  source: string;
}

/**
 * Abonnement au flux SSE /api/stream. EventSource se reconnecte tout seul ;
 * le snapshot initial remplit l'état d'un coup.
 */
export function useLiveQuotes(): {
  quotes: Record<string, LiveQuote>;
  connected: boolean;
} {
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource("/api/stream");

    es.addEventListener("snapshot", (event) => {
      const list = JSON.parse((event as MessageEvent).data) as LiveQuote[];
      setQuotes(Object.fromEntries(list.map((q) => [q.symbol, q])));
      setConnected(true);
    });
    es.addEventListener("quote", (event) => {
      const quote = JSON.parse((event as MessageEvent).data) as LiveQuote;
      setQuotes((prev) => ({ ...prev, [quote.symbol]: quote }));
    });
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    return () => es.close();
  }, []);

  return { quotes, connected };
}
