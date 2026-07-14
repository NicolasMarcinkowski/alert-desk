/**
 * Génération CSV — fonctions PURES.
 *
 * Format compatible tableur/impôts : séparateur virgule, échappement RFC 4180
 * (guillemets doublés, champ entre guillemets s'il contient , " ou saut de
 * ligne), BOM UTF-8 en tête pour qu'Excel lise correctement les accents.
 */

export type CsvCell = string | number | null | undefined;

function escapeCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return "";
  const s = String(cell);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Assemble un CSV (avec BOM) à partir d'en-têtes et de lignes. */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** Nombre → chaîne à N décimales, ou vide si null/undefined. */
export function num(v: number | null | undefined, decimals = 2): string {
  return v === null || v === undefined || !Number.isFinite(v)
    ? ""
    : v.toFixed(decimals);
}
