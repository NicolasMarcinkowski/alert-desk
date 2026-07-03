import { formatSignedMoney } from "@/lib/utils/format";

const MONTH_LABELS = [
  "Janv.",
  "Févr.",
  "Mars",
  "Avr.",
  "Mai",
  "Juin",
  "Juil.",
  "Août",
  "Sept.",
  "Oct.",
  "Nov.",
  "Déc.",
];

/**
 * Heatmap calendrier du P&L quotidien net : une ligne par mois,
 * une cellule par jour, opacité proportionnelle à |P&L| (vert/rouge
 * réservés au P&L conformément à la DA).
 */
export function PnlHeatmap({
  dailyPnl,
  currency,
}: {
  dailyPnl: { date: string; pnl: number }[];
  currency: string;
}) {
  if (dailyPnl.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-ink-mute">
        Aucun P&L réalisé sur la période.
      </p>
    );
  }

  const byDate = new Map(dailyPnl.map((d) => [d.date, d.pnl]));
  const maxAbs = Math.max(...dailyPnl.map((d) => Math.abs(d.pnl)), 1);

  // Mois présents dans la période (bornés aux 8 derniers pour la lisibilité)
  const months = [
    ...new Set(dailyPnl.map((d) => d.date.slice(0, 7))),
  ]
    .sort()
    .slice(-8);

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5">
        <tbody>
          {months.map((month) => {
            const [y, m] = month.split("-").map(Number);
            const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
            return (
              <tr key={month}>
                <td className="pr-2 text-right text-[10px] text-ink-mute">
                  {MONTH_LABELS[m - 1]} {String(y).slice(2)}
                </td>
                {Array.from({ length: 31 }, (_, i) => {
                  const day = i + 1;
                  if (day > daysInMonth) {
                    return <td key={day} className="size-3.5" />;
                  }
                  const key = `${month}-${String(day).padStart(2, "0")}`;
                  const pnl = byDate.get(key);
                  const opacity =
                    pnl !== undefined
                      ? 0.25 + 0.75 * (Math.abs(pnl) / maxAbs)
                      : undefined;
                  return (
                    <td
                      key={day}
                      title={
                        pnl !== undefined
                          ? `${key} : ${formatSignedMoney(pnl, currency)}`
                          : key
                      }
                      className="size-3.5 rounded-xs"
                      style={{
                        backgroundColor:
                          pnl === undefined
                            ? "var(--color-surface-2)"
                            : pnl >= 0
                              ? `color-mix(in srgb, var(--color-gain) ${Math.round((opacity ?? 0) * 100)}%, transparent)`
                              : `color-mix(in srgb, var(--color-loss) ${Math.round((opacity ?? 0) * 100)}%, transparent)`,
                      }}
                    />
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-ink-mute">
        P&L net quotidien (réalisé, frais déduits) · survoler une cellule pour
        le détail
      </p>
    </div>
  );
}
