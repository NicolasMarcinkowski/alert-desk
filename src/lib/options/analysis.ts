/**
 * Analyse d'une chaîne d'options — fonctions PURES.
 *
 * Produit les repères que les traders d'indices (SPY/QQQ) utilisent pour lire
 * les « phases » : exposition gamma des teneurs de marché (GEX) et son niveau
 * de bascule, ratio put/call, IV ATM, murs d'open interest, max pain.
 *
 * ⚠️ HEURISTIQUE assumée sur le GEX : on suppose la convention dealer standard
 * — dealers LONG gamma sur les calls, SHORT gamma sur les puts (calls comptés +,
 * puts −). C'est la convention retail répandue ; la VALEUR absolue est moins
 * fiable que la FORME du profil et le niveau de bascule (gamma flip). Données
 * EOD (open interest publié en fin de séance). À ne pas prendre pour un signal
 * garanti.
 */

import { gamma } from "./black-scholes";

export interface OptionLeg {
  strike: number;
  openInterest: number;
  volume: number;
  iv: number; // décimal (0.18 = 18 %)
}

export interface OptionsChain {
  symbol: string;
  spot: number;
  /** Années jusqu'à l'expiration analysée */
  timeToExpiryYears: number;
  expiry: string; // yyyy-mm-dd
  calls: OptionLeg[];
  puts: OptionLeg[];
  /** epoch ms de la donnée (fraîcheur) */
  asOf: number;
}

export interface GexStrike {
  strike: number;
  gex: number;
}

export interface OptionsAnalysis {
  symbol: string;
  spot: number;
  expiry: string;
  asOf: number;
  /** GEX net total (unités : $ / point d'indice, échelle indicative) */
  totalGex: number;
  gexByStrike: GexStrike[];
  /** Niveau de spot où le GEX cumulé s'annule (bascule long/short gamma) */
  gammaFlip: number | null;
  putCallRatioOi: number | null;
  putCallRatioVol: number | null;
  /** IV interpolée au plus proche de la monnaie (décimal) */
  atmIv: number | null;
  /** Strikes à plus fort OI (résistance/soutien probables) */
  callWall: number | null;
  putWall: number | null;
  /** Strike minimisant la valeur intrinsèque totale des options en vie */
  maxPain: number | null;
}

const RISK_FREE = 0.04; // approximation ; n'affecte quasiment pas le gamma

function sumOi(legs: OptionLeg[]): number {
  return legs.reduce((s, l) => s + l.openInterest, 0);
}
function sumVol(legs: OptionLeg[]): number {
  return legs.reduce((s, l) => s + l.volume, 0);
}

/** GEX d'une jambe : gamma × OI × 100 (multiplicateur) × spot² × 0.01 (par 1 %). */
function legGex(leg: OptionLeg, spot: number, T: number): number {
  const g = gamma(spot, leg.strike, T, RISK_FREE, leg.iv);
  return g * leg.openInterest * 100 * spot * spot * 0.01;
}

/** IV au strike le plus proche du spot (moyenne call/put si dispo). */
function atmIv(chain: OptionsChain): number | null {
  const near = (legs: OptionLeg[]) =>
    legs
      .filter((l) => l.iv > 0)
      .sort(
        (a, b) =>
          Math.abs(a.strike - chain.spot) - Math.abs(b.strike - chain.spot)
      )[0];
  const c = near(chain.calls);
  const p = near(chain.puts);
  const vals = [c?.iv, p?.iv].filter((v): v is number => v != null && v > 0);
  if (vals.length === 0) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

/** Strike de plus fort open interest (mur). */
function wall(legs: OptionLeg[]): number | null {
  let best: OptionLeg | null = null;
  for (const l of legs) if (!best || l.openInterest > best.openInterest) best = l;
  return best && best.openInterest > 0 ? best.strike : null;
}

/**
 * Max pain : strike minimisant le paiement total aux détenteurs d'options
 * (valeur intrinsèque × OI) — proxy du « point d'aimantation » à l'expiration.
 */
function maxPain(chain: OptionsChain): number | null {
  const strikes = [
    ...new Set([
      ...chain.calls.map((c) => c.strike),
      ...chain.puts.map((p) => p.strike),
    ]),
  ].sort((a, b) => a - b);
  if (strikes.length === 0) return null;
  let bestStrike: number | null = null;
  let bestPain = Infinity;
  for (const s of strikes) {
    let pain = 0;
    for (const c of chain.calls) {
      if (s > c.strike) pain += (s - c.strike) * c.openInterest;
    }
    for (const p of chain.puts) {
      if (s < p.strike) pain += (p.strike - s) * p.openInterest;
    }
    if (pain < bestPain) {
      bestPain = pain;
      bestStrike = s;
    }
  }
  return bestStrike;
}

/**
 * Niveau de gamma flip : spot où le GEX cumulé (des strikes bas vers hauts)
 * change de signe. Interpolation linéaire entre les deux strikes encadrants.
 */
function gammaFlip(gexByStrike: GexStrike[]): number | null {
  if (gexByStrike.length < 2) return null;
  const sorted = [...gexByStrike].sort((a, b) => a.strike - b.strike);
  let cum = 0;
  const cumPts: { strike: number; cum: number }[] = [];
  for (const g of sorted) {
    cum += g.gex;
    cumPts.push({ strike: g.strike, cum });
  }
  for (let i = 1; i < cumPts.length; i++) {
    const a = cumPts[i - 1];
    const b = cumPts[i];
    if ((a.cum <= 0 && b.cum >= 0) || (a.cum >= 0 && b.cum <= 0)) {
      if (a.cum === b.cum) return a.strike;
      const t = -a.cum / (b.cum - a.cum);
      return a.strike + t * (b.strike - a.strike);
    }
  }
  return null; // pas de changement de signe sur la plage
}

export function analyzeOptions(chain: OptionsChain): OptionsAnalysis {
  const T = chain.timeToExpiryYears;
  const gexByStrike: GexStrike[] = [];
  const byStrike = new Map<number, number>();
  for (const c of chain.calls) {
    byStrike.set(
      c.strike,
      (byStrike.get(c.strike) ?? 0) + legGex(c, chain.spot, T)
    );
  }
  for (const p of chain.puts) {
    // Puts : gamma dealer de signe opposé (convention heuristique)
    byStrike.set(
      p.strike,
      (byStrike.get(p.strike) ?? 0) - legGex(p, chain.spot, T)
    );
  }
  for (const [strike, gex] of byStrike) gexByStrike.push({ strike, gex });
  gexByStrike.sort((a, b) => a.strike - b.strike);

  const totalGex = gexByStrike.reduce((s, g) => s + g.gex, 0);
  const oiPuts = sumOi(chain.puts);
  const oiCalls = sumOi(chain.calls);
  const volPuts = sumVol(chain.puts);
  const volCalls = sumVol(chain.calls);

  return {
    symbol: chain.symbol,
    spot: chain.spot,
    expiry: chain.expiry,
    asOf: chain.asOf,
    totalGex,
    gexByStrike,
    gammaFlip: gammaFlip(gexByStrike),
    putCallRatioOi: oiCalls > 0 ? oiPuts / oiCalls : null,
    putCallRatioVol: volCalls > 0 ? volPuts / volCalls : null,
    atmIv: atmIv(chain),
    callWall: wall(chain.calls),
    putWall: wall(chain.puts),
    maxPain: maxPain(chain),
  };
}
