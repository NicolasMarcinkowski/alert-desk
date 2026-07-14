/**
 * Cache mémoire des bougies journalières par symbole (un conteneur en prod).
 * Gardé par `globalThis` comme les autres singletons (survit au hot-reload
 * dev). Les clôtures historiques sont figées ; seule la bougie du jour évolue,
 * et l'évaluateur la remplace par le dernier cours live au moment du calcul —
 * on ne re-télécharge donc les bougies qu'une fois par jour (voir maxAge).
 */

import type { Bar } from "./bars";

interface BarCacheEntry {
  bars: Bar[];
  fetchedAt: number;
}

interface BarCacheState {
  bySymbol: Map<string, BarCacheEntry>;
}

const globalRef = globalThis as unknown as {
  __alertDeskBarCache?: BarCacheState;
};

function state(): BarCacheState {
  if (!globalRef.__alertDeskBarCache) {
    globalRef.__alertDeskBarCache = { bySymbol: new Map() };
  }
  return globalRef.__alertDeskBarCache;
}

export function getBars(symbol: string): Bar[] | null {
  return state().bySymbol.get(symbol)?.bars ?? null;
}

export function setBars(symbol: string, bars: Bar[]): void {
  state().bySymbol.set(symbol, { bars, fetchedAt: Date.now() });
}

/** true si le symbole n'est pas en cache ou plus vieux que `maxAgeMs`. */
export function barsStale(symbol: string, maxAgeMs: number): boolean {
  const entry = state().bySymbol.get(symbol);
  if (!entry) return true;
  return Date.now() - entry.fetchedAt > maxAgeMs;
}

/** Retire du cache les symboles qui ne sont plus suivis. */
export function pruneBars(keep: Set<string>): void {
  for (const symbol of [...state().bySymbol.keys()]) {
    if (!keep.has(symbol)) state().bySymbol.delete(symbol);
  }
}
