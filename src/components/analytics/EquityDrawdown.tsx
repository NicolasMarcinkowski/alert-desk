import { formatDate, formatMoney } from "@/lib/utils/format";

/**
 * Courbe d'equity AJUSTÉE des dépôts/retraits, avec drawdown ombré sous le
 * pic courant. Min/max affichés (l'axe ne part pas de zéro).
 */
export function EquityDrawdown({
  points,
  currency,
}: {
  points: { date: Date; adjusted: number; drawdownPct: number }[];
  currency: string;
}) {
  if (points.length < 2) {
    return (
      <p className="py-12 text-center text-sm text-ink-mute">
        Pas assez de snapshots quotidiens sur la période.
      </p>
    );
  }

  const W = 640;
  const H = 200;
  const PAD = 6;
  const values = points.map((p) => p.adjusted);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const xy = (i: number, v: number): [number, number] => [
    PAD + (i / (points.length - 1)) * (W - 2 * PAD),
    PAD + (1 - (v - min) / span) * (H - 2 * PAD),
  ];

  const line = points.map((p, i) => xy(i, p.adjusted).join(",")).join(" ");

  // Zone entre le pic courant (running peak) et la courbe = drawdown
  const peaks = points.reduce<number[]>((acc, p) => {
    const prev = acc.length > 0 ? acc[acc.length - 1] : -Infinity;
    acc.push(Math.max(prev, p.adjusted));
    return acc;
  }, []);
  const ddArea =
    `M${points.map((p, i) => xy(i, peaks[i]).join(",")).join(" L")}` +
    ` L${points
      .slice()
      .reverse()
      .map((p, ri) => xy(points.length - 1 - ri, p.adjusted).join(","))
      .join(" L")} Z`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Courbe d'equity avec drawdown"
      >
        <path d={ddArea} fill="var(--color-loss)" opacity="0.12" />
        <polyline
          points={line}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
      <div className="mt-2 flex items-center justify-between font-mono text-[10px] tabular-nums text-ink-mute">
        <span>{formatDate(points[0].date)}</span>
        <span>
          min {formatMoney(min, currency, 0)} · max{" "}
          {formatMoney(max, currency, 0)} · ajusté des dépôts/retraits
        </span>
        <span>{formatDate(points[points.length - 1].date)}</span>
      </div>
    </div>
  );
}
