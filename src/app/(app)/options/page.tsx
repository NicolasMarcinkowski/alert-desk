import { PageTitle } from "@/components/ui/PagePlaceholder";
import { Card } from "@/components/ui/Card";
import { getOptionsAnalysis } from "@/lib/marketdata/options-chain";
import type { OptionsAnalysis } from "@/lib/options/analysis";
import { formatPrice, formatPct } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

// Indices les plus pertinents pour l'analyse gamma (0DTE/weeklies très liquides)
const SYMBOLS = ["SPY", "QQQ"];

export default async function OptionsPage() {
  const analyses = await Promise.all(
    SYMBOLS.map(async (s) => [s, await getOptionsAnalysis(s)] as const)
  );

  return (
    <div>
      <PageTitle
        title="Options — GEX & IV"
        subtitle="Positionnement optionnel des indices (données EOD, gratuit) — repères de lecture, pas des signaux garantis"
      />

      <p className="mb-4 rounded-lg border border-warn/40 bg-warn/10 px-4 py-2.5 text-xs leading-relaxed text-warn">
        Données de <span className="font-semibold">fin de séance</span> (open
        interest publié après clôture). Le GEX suppose la convention dealer
        standard (calls +, puts −) : c&apos;est une{" "}
        <span className="font-semibold">heuristique</span> — la forme du profil
        et le niveau de bascule (gamma flip) comptent plus que la valeur absolue.
      </p>

      <div className="flex flex-col gap-4">
        {analyses.map(([symbol, a]) => (
          <SymbolCard key={symbol} symbol={symbol} a={a} />
        ))}
      </div>
    </div>
  );
}

function SymbolCard({
  symbol,
  a,
}: {
  symbol: string;
  a: OptionsAnalysis | null;
}) {
  if (!a) {
    return (
      <Card title={symbol}>
        <p className="py-6 text-center text-sm text-ink-mute">
          Chaîne d&apos;options indisponible (Yahoo a refusé la requête, ou
          aucune donnée). Réessaie plus tard — l&apos;analyse est mise en cache
          dès qu&apos;elle répond.
        </p>
      </Card>
    );
  }

  const gammaLong = a.totalGex >= 0;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-base font-semibold">{symbol}</span>
          <span className="font-mono text-sm text-ink-soft">
            {formatPrice(a.spot, "USD")}
          </span>
          <span className="text-xs text-ink-mute">exp. {a.expiry}</span>
        </div>
        <span className="rounded border border-edge bg-surface-2 px-1.5 py-px font-mono text-[9px] font-semibold tracking-wider text-ink-soft">
          EOD
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="IV ATM" value={a.atmIv != null ? formatPct(a.atmIv * 100) : "—"} />
        <Stat
          label="Put/Call (OI)"
          value={a.putCallRatioOi != null ? a.putCallRatioOi.toFixed(2) : "—"}
          hint={
            a.putCallRatioOi != null
              ? a.putCallRatioOi > 1
                ? "défensif"
                : "offensif"
              : undefined
          }
        />
        <Stat
          label="Gamma net"
          value={gammaLong ? "LONG" : "SHORT"}
          hint={gammaLong ? "amortisseur" : "amplificateur"}
        />
        <Stat
          label="Gamma flip"
          value={a.gammaFlip != null ? formatPrice(a.gammaFlip, "USD") : "—"}
        />
        <Stat
          label="Mur call / put"
          value={`${a.callWall ?? "—"} / ${a.putWall ?? "—"}`}
        />
        <Stat
          label="Max pain"
          value={a.maxPain != null ? formatPrice(a.maxPain, "USD") : "—"}
        />
      </div>

      <GexProfile a={a} />
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-edge-soft bg-surface-2/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-ink-mute">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
        {value}
      </div>
      {hint && <div className="text-[10px] text-ink-mute">{hint}</div>}
    </div>
  );
}

/** Profil GEX par strike autour du spot : barres signées (bleu +, ambre −). */
function GexProfile({ a }: { a: OptionsAnalysis }) {
  const near = [...a.gexByStrike]
    .sort(
      (x, y) => Math.abs(x.strike - a.spot) - Math.abs(y.strike - a.spot)
    )
    .slice(0, 13)
    .sort((x, y) => y.strike - x.strike);
  const max = Math.max(...near.map((g) => Math.abs(g.gex)), 1);

  if (near.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="mb-1.5 text-[10px] uppercase tracking-wider text-ink-mute">
        GEX par strike (bleu = long gamma, ambre = short gamma)
      </div>
      <div className="flex flex-col gap-0.5">
        {near.map((g) => {
          const pct = (Math.abs(g.gex) / max) * 100;
          const pos = g.gex >= 0;
          const atSpot = Math.abs(g.strike - a.spot) < 0.5;
          return (
            <div key={g.strike} className="flex items-center gap-2 text-xs">
              <span
                className={`w-14 shrink-0 text-right font-mono tabular-nums ${
                  atSpot ? "font-bold text-ink" : "text-ink-soft"
                }`}
              >
                {g.strike}
              </span>
              <div className="flex h-3 flex-1 items-center">
                <div
                  className={`h-2 rounded-sm ${pos ? "bg-accent/70" : "bg-warn/70"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
