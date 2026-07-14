"use client";

import { useState } from "react";

/**
 * Export CSV du journal (round-trips) et des exécutions, filtrable par année
 * civile — utile pour la déclaration fiscale ou l'archivage hors Postgres.
 * Liens directs vers les routes /api/export (session requise, scope userId).
 */
export function JournalExport({ years }: { years: number[] }) {
  const [year, setYear] = useState<string>(
    years.length > 0 ? String(years[0]) : "all"
  );
  const range =
    year === "all" ? "" : `?from=${year}-01-01&to=${year}-12-31`;

  const linkClass =
    "cursor-pointer rounded-lg border border-edge bg-surface-2 px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent/50";

  return (
    <div className="flex items-center gap-2">
      <select
        value={year}
        onChange={(e) => setYear(e.target.value)}
        aria-label="Année d'export"
        className="rounded-lg border border-edge bg-surface-2 px-2.5 py-1.5 text-xs outline-none focus:border-accent/60"
      >
        <option value="all">Tout</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <a href={`/api/export/round-trips${range}`} className={linkClass} download>
        Trades CSV
      </a>
      <a href={`/api/export/executions${range}`} className={linkClass} download>
        Exécutions CSV
      </a>
    </div>
  );
}
