/**
 * Chaîne d'options via Yahoo (v7) — source GRATUITE mais EOD et fragile.
 *
 * Yahoo protège cet endpoint par un handshake cookie + « crumb » (anti-bot) :
 * on récupère un cookie sur la home, un crumb via /v1/test/getcrumb, puis on
 * appelle /v7/finance/options avec les deux. Le couple est mis en cache et
 * rafraîchi sur 401 (crumb périmé). Tout échec → `null` (analyse dormante,
 * jamais de donnée fausse). En environnement très throttlé, Yahoo peut refuser
 * (429) : c'est attendu, la couche appelante affiche « indisponible ».
 *
 * Données EOD : l'open interest n'est publié qu'en fin de séance.
 */

import {
  analyzeOptions,
  type OptionsAnalysis,
  type OptionLeg,
  type OptionsChain,
} from "@/lib/options/analysis";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const SESSION_TTL_MS = 60 * 60 * 1000;
const ANALYSIS_TTL_MS = 30 * 60 * 1000;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

interface YahooSession {
  cookie: string;
  crumb: string;
  at: number;
}
interface OptionsCacheState {
  session: YahooSession | null;
  analysis: Map<string, { data: OptionsAnalysis | null; at: number }>;
}

const globalRef = globalThis as unknown as {
  __alertDeskOptions?: OptionsCacheState;
};
function state(): OptionsCacheState {
  if (!globalRef.__alertDeskOptions) {
    globalRef.__alertDeskOptions = { session: null, analysis: new Map() };
  }
  return globalRef.__alertDeskOptions;
}

async function getSession(force = false): Promise<YahooSession | null> {
  const s = state();
  if (!force && s.session && Date.now() - s.session.at < SESSION_TTL_MS) {
    return s.session;
  }
  try {
    const home = await fetch("https://finance.yahoo.com/", {
      headers: { "User-Agent": UA, Accept: "text/html" },
      redirect: "follow",
    });
    const setCookies =
      (home.headers as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
    if (!cookie) return null;
    const crumbRes = await fetch(
      "https://query1.finance.yahoo.com/v1/test/getcrumb",
      { headers: { "User-Agent": UA, Cookie: cookie, Accept: "text/plain" } }
    );
    if (!crumbRes.ok) return null;
    const crumb = (await crumbRes.text()).trim();
    // Une réponse throttlée ("Too Many Requests") ou vide n'est pas un crumb.
    if (!crumb || crumb.length > 64 || /\s/.test(crumb)) return null;
    s.session = { cookie, crumb, at: Date.now() };
    return s.session;
  } catch {
    return null;
  }
}

function toLegs(arr: unknown): OptionLeg[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((o) => ({
      strike: Number((o as Record<string, unknown>).strike),
      openInterest: Number((o as Record<string, unknown>).openInterest ?? 0),
      volume: Number((o as Record<string, unknown>).volume ?? 0),
      iv: Number((o as Record<string, unknown>).impliedVolatility ?? 0),
    }))
    .filter((l) => Number.isFinite(l.strike) && l.strike > 0);
}

/** Chaîne brute de l'expiration la plus proche (là où se concentre le gamma). */
export async function fetchOptionsChain(
  symbol: string
): Promise<OptionsChain | null> {
  const sym = symbol.trim().toUpperCase();
  for (let attempt = 0; attempt < 2; attempt++) {
    const session = await getSession(attempt > 0);
    if (!session) return null;
    let res: Response;
    try {
      res = await fetch(
        `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(
          sym
        )}?crumb=${encodeURIComponent(session.crumb)}`,
        {
          headers: { "User-Agent": UA, Cookie: session.cookie, Accept: "application/json" },
          cache: "no-store",
        }
      );
    } catch {
      return null;
    }
    if (res.status === 401) {
      state().session = null; // crumb périmé → on refait le handshake
      continue;
    }
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as {
      optionChain?: { result?: unknown[] };
    } | null;
    const result = data?.optionChain?.result?.[0] as
      | {
          quote?: { regularMarketPrice?: number };
          options?: Array<{
            expirationDate?: number;
            calls?: unknown;
            puts?: unknown;
          }>;
        }
      | undefined;
    const spot = Number(result?.quote?.regularMarketPrice);
    const opt = result?.options?.[0];
    if (!result || !spot || !opt || !opt.expirationDate) return null;
    const expMs = Number(opt.expirationDate) * 1000;
    return {
      symbol: sym,
      spot,
      timeToExpiryYears: Math.max((expMs - Date.now()) / YEAR_MS, 1 / 365),
      expiry: new Date(expMs).toISOString().slice(0, 10),
      calls: toLegs(opt.calls),
      puts: toLegs(opt.puts),
      asOf: Date.now(),
    };
  }
  return null;
}

/**
 * Lecture SYNCHRONE de l'analyse en cache (sans fetch) — pour l'évaluateur
 * d'alertes, qui doit rester synchrone. `null` si pas encore chargée : la
 * règle reste dormante jusqu'au prochain refresh du moteur.
 */
export function getCachedAnalysis(symbol: string): OptionsAnalysis | null {
  return state().analysis.get(symbol.trim().toUpperCase())?.data ?? null;
}

/** Analyse mise en cache (EOD) — `null` si la chaîne est indisponible. */
export async function getOptionsAnalysis(
  symbol: string
): Promise<OptionsAnalysis | null> {
  const sym = symbol.trim().toUpperCase();
  const cache = state().analysis;
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.at < ANALYSIS_TTL_MS) return hit.data;
  const chain = await fetchOptionsChain(sym);
  const data = chain ? analyzeOptions(chain) : null;
  cache.set(sym, { data, at: Date.now() });
  return data;
}
