/**
 * Greeks Black-Scholes — fonctions PURES (aucune I/O).
 *
 * On dispose de l'IV (fournie par la chaîne d'options) : on en dérive gamma
 * et delta plutôt que de résoudre l'IV. Modèle sans dividende (approximation
 * acceptable pour SPY/QQQ à courte échéance ; le dividende décale surtout le
 * niveau, pas la forme du profil de gamma).
 *
 * Conventions : S=sous-jacent, K=strike, T=années jusqu'à expiration,
 * r=taux sans risque (décimal), sigma=IV (décimal, ex. 0.18 pour 18 %).
 */

/** Densité de la loi normale centrée réduite. */
function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Fonction de répartition normale (approximation Abramowitz-Stegun 7.1.26). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-0.5 * x * x);
  const p =
    d *
    t *
    (0.31938153 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

function d1(S: number, K: number, T: number, r: number, sigma: number): number {
  return (
    (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T))
  );
}

/**
 * Gamma : sensibilité du delta au sous-jacent (identique call/put).
 * Renvoie 0 pour des entrées dégénérées (T, sigma, S ≤ 0).
 */
export function gamma(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number
): number {
  if (S <= 0 || K <= 0 || T <= 0 || sigma <= 0) return 0;
  const denom = S * sigma * Math.sqrt(T);
  if (denom === 0) return 0;
  return normPdf(d1(S, K, T, r, sigma)) / denom;
}

/** Delta (call ou put). */
export function delta(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  isCall: boolean
): number {
  if (S <= 0 || K <= 0 || T <= 0 || sigma <= 0) {
    // À l'échéance / dégénéré : delta binaire selon la monnaie
    const itm = isCall ? S > K : S < K;
    return itm ? (isCall ? 1 : -1) : 0;
  }
  const nd1 = normCdf(d1(S, K, T, r, sigma));
  return isCall ? nd1 : nd1 - 1;
}
