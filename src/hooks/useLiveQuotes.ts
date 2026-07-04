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

type QuotesMap = Record<string, LiveQuote>;
type Listener = (quotes: QuotesMap, connected: boolean) => void;

/**
 * Connexion SSE PARTAGÉE au niveau module : quel que soit le nombre de
 * composants live montés (header + table + tuile…), un onglet n'ouvre
 * qu'une seule connexion /api/stream (limite navigateur : ~6 connexions
 * HTTP/1.1 par origine).
 */
const shared: {
  es: EventSource | null;
  refs: number;
  quotes: QuotesMap;
  connected: boolean;
  listeners: Set<Listener>;
} = { es: null, refs: 0, quotes: {}, connected: false, listeners: new Set() };

function notify() {
  for (const listener of shared.listeners) {
    listener(shared.quotes, shared.connected);
  }
}

function acquire(listener: Listener): () => void {
  shared.listeners.add(listener);
  shared.refs++;

  if (!shared.es) {
    const es = new EventSource("/api/stream");
    shared.es = es;

    es.addEventListener("snapshot", (event) => {
      const list = JSON.parse((event as MessageEvent).data) as LiveQuote[];
      shared.quotes = Object.fromEntries(list.map((q) => [q.symbol, q]));
      shared.connected = true;
      notify();
    });
    es.addEventListener("quotes", (event) => {
      const batch = JSON.parse((event as MessageEvent).data) as LiveQuote[];
      shared.quotes = {
        ...shared.quotes,
        ...Object.fromEntries(batch.map((q) => [q.symbol, q])),
      };
      notify();
    });
    es.onopen = () => {
      shared.connected = true;
      notify();
    };
    es.onerror = () => {
      shared.connected = false; // EventSource se reconnecte tout seul
      notify();
    };
  }

  // État courant livré immédiatement au nouveau souscripteur
  listener(shared.quotes, shared.connected);

  return () => {
    shared.listeners.delete(listener);
    shared.refs--;
    if (shared.refs <= 0 && shared.es) {
      shared.es.close();
      shared.es = null;
      shared.connected = false;
    }
  };
}

export function useLiveQuotes(): {
  quotes: QuotesMap;
  connected: boolean;
} {
  const [state, setState] = useState<{ quotes: QuotesMap; connected: boolean }>(
    { quotes: {}, connected: false }
  );

  useEffect(() => {
    return acquire((quotes, connected) => setState({ quotes, connected }));
  }, []);

  return state;
}
