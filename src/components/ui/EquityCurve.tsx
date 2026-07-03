import { formatDate, formatMoney } from "@/lib/utils/format";

/**
 * Courbe d'equity server-rendered (SVG pur, pas de lib).
 * L'axe Y ne part PAS de zéro (lisibilité des variations de NAV) —
 * min/max affichés explicitement pour rester honnête.
 */
export function EquityCurve({
  points,
  currency,
}: {
  points: { date: Date; nav: number }[];
  currency: string;
}) {
  if (points.length < 2) {
    return (
      <p className="py-12 text-center text-sm text-ink-mute">
        Il faut au moins deux snapshots quotidiens pour tracer la courbe —
        reviens après la prochaine sync nightly.
      </p>
    );
  }

  const W = 640;
  const H = 180;
  const PAD = 6;
  const navs = points.map((p) => p.nav);
  const min = Math.min(...navs);
  const max = Math.max(...navs);
  const span = max - min || 1;

  const coords = points.map((p, i) => {
    const x = PAD + (i / (points.length - 1)) * (W - 2 * PAD);
    const y = PAD + (1 - (p.nav - min) / span) * (H - 2 * PAD);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const areaPath = `M${coords[0]} L${coords.join(" L")} L${W - PAD},${H - PAD} L${PAD},${H - PAD} Z`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Courbe d'equity"
      >
        <path d={areaPath} fill="var(--color-accent)" opacity="0.08" />
        <polyline
          points={coords.join(" ")}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
      <div className="mt-2 flex items-center justify-between font-mono text-[10px] tabular-nums text-ink-mute">
        <span>{formatDate(points[0].date)}</span>
        <span>
          min {formatMoney(min, currency, 0)} · max {formatMoney(max, currency, 0)}
        </span>
        <span>{formatDate(points[points.length - 1].date)}</span>
      </div>
    </div>
  );
}
