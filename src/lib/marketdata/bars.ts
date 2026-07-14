/**
 * Bougies journalières OHLCV via l'endpoint chart Yahoo (non officiel, gratuit).
 * Utilisé par les alertes d'analyse technique (le flux temps réel ne fournit
 * qu'un dernier cours). Finnhub ne sert plus l'historique en offre gratuite,
 * d'où le choix de Yahoo — déjà une dépendance du provider de quotes.
 *
 * Répond `null` plutôt que de jeter : sans bougies, l'alerte reste dormante.
 */

import { RateLimiter } from "./rate-limiter";

export interface Bar {
  /** epoch ms (ouverture de la séance) */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

// Yahoo répartit la charge sur query1/query2 ; l'un peut renvoyer 429 quand
// l'autre répond. On tente les deux avant d'abandonner.
const CHART_HOSTS = [
  "https://query1.finance.yahoo.com/v8/finance/chart",
  "https://query2.finance.yahoo.com/v8/finance/chart",
];
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// Partagé avec le poll de quotes Yahoo côté esprit (30/min) — instance dédiée
// ici pour ne pas assécher les slots des quotes temps réel.
const limiter = new RateLimiter(20, 60_000);

/**
 * Récupère les bougies journalières sur `range` (défaut 2 ans ≈ 500 séances :
 * couvre les périodes maximales acceptées — SMA 400, plus-haut 400 j / 52 sem.
 * — pour qu'aucune alerte à longue période ne reste dormante faute de données).
 */
export async function fetchDailyBars(
  symbol: string,
  range = "2y"
): Promise<Bar[] | null> {
  await limiter.acquire();
  try {
    const path = `/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
    let data: unknown = null;
    for (const host of CHART_HOSTS) {
      const res = await fetch(`${host}${path}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        cache: "no-store",
      });
      if (res.ok) {
        data = await res.json();
        break;
      }
      // 429/5xx sur cet hôte → on tente l'autre ; sinon on abandonne.
      if (res.status !== 429 && res.status < 500) return null;
    }
    if (!data) return null;
    const result = (data as { chart?: { result?: unknown[] } })?.chart
      ?.result?.[0] as
      | {
          timestamp?: unknown;
          indicators?: { quote?: Array<Record<string, unknown[]>> };
        }
      | undefined;
    const ts: unknown = result?.timestamp;
    const quote = result?.indicators?.quote?.[0];
    if (!result || !Array.isArray(ts) || !quote) return null;

    const bars: Bar[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = quote.close?.[i];
      // Séance sans clôture (jour férié partiel, trou de données) : on saute.
      if (c == null || !Number.isFinite(Number(c))) continue;
      const close = Number(c);
      bars.push({
        t: Number(ts[i]) * 1000,
        o: Number(quote.open?.[i] ?? close),
        h: Number(quote.high?.[i] ?? close),
        l: Number(quote.low?.[i] ?? close),
        c: close,
        v: Number(quote.volume?.[i] ?? 0),
      });
    }
    return bars.length > 0 ? bars : null;
  } catch {
    return null;
  }
}
