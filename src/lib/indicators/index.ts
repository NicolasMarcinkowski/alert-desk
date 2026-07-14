/**
 * Indicateurs techniques — fonctions PURES (aucune I/O, aucun état).
 *
 * Elles opèrent sur des séries de clôtures/valeurs déjà ordonnées du plus
 * ancien au plus récent. Chacune renvoie `null` si la série est trop courte
 * pour un calcul valide (l'alerte reste alors dormante plutôt que de tirer
 * sur une valeur fausse).
 *
 * Convention : pour réagir en intraséance, l'appelant passe la clôture du
 * jour en cours remplacée par le dernier cours live (voir l'évaluateur).
 */

/** Moyenne mobile simple sur les `period` dernières valeurs. */
export function sma(values: number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

/**
 * Moyenne mobile exponentielle (dernière valeur de la série EMA).
 * Amorçage par la SMA des `period` premières valeurs, puis lissage α=2/(p+1).
 */
export function ema(values: number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  const k = 2 / (period + 1);
  let e = 0;
  for (let i = 0; i < period; i++) e += values[i];
  e /= period;
  for (let i = period; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
  }
  return e;
}

/**
 * RSI de Wilder sur `period` (14 par défaut). Renvoie une valeur dans [0,100],
 * ou `null` si moins de `period + 1` valeurs (il faut `period` variations).
 */
export function rsi(values: number[], period = 14): number | null {
  if (period <= 0 || values.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  // Première moyenne : sur les `period` premières variations
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  // Lissage de Wilder pour le reste de la série
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const up = diff > 0 ? diff : 0;
    const down = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + up) / period;
    avgLoss = (avgLoss * (period - 1) + down) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Plus-haut des `lookback` dernières valeurs (typiquement des highs). */
export function highest(values: number[], lookback: number): number | null {
  if (lookback <= 0 || values.length < lookback) return null;
  let max = -Infinity;
  for (let i = values.length - lookback; i < values.length; i++) {
    if (values[i] > max) max = values[i];
  }
  return max;
}

/** Plus-bas des `lookback` dernières valeurs (typiquement des lows). */
export function lowest(values: number[], lookback: number): number | null {
  if (lookback <= 0 || values.length < lookback) return null;
  let min = Infinity;
  for (let i = values.length - lookback; i < values.length; i++) {
    if (values[i] < min) min = values[i];
  }
  return min;
}
