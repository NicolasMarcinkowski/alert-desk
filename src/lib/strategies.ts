/**
 * Stratégies de trading annotables sur un round-trip — liste unique,
 * partagée entre la validation API et le sélecteur du journal.
 */
export const STRATEGIES = [
  { value: "wheel", label: "Wheel" },
  { value: "covered-call", label: "Covered call" },
  { value: "cash-secured-put", label: "Cash-secured put" },
  { value: "swing", label: "Swing" },
  { value: "earnings", label: "Earnings" },
  { value: "day-trade", label: "Day trade" },
  { value: "long-terme", label: "Long terme" },
  { value: "autre", label: "Autre" },
] as const;

export const STRATEGY_VALUES: readonly string[] = STRATEGIES.map(
  (s) => s.value
);
