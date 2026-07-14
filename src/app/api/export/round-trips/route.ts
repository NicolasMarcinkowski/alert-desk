import { prisma } from "@/lib/db/client";
import { requireSession, unauthorized } from "@/lib/api/validation";
import { toCsv, num, type CsvCell } from "@/lib/export/csv";

/** "2026-01-01" → Date UTC, ou undefined si invalide. */
function parseFrom(s: string | null): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
function parseTo(s: string | null): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Export CSV des round-trips clôturés (déclaration fiscale, archivage).
 * Filtre optionnel par date de clôture : ?from=YYYY-MM-DD&to=YYYY-MM-DD.
 * P&L net = Σ fifoPnlRealized − Σ|commissions|, converti en devise de base
 * (même calcul que la page Analytics).
 */
export async function GET(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const from = parseFrom(url.searchParams.get("from"));
  const to = parseTo(url.searchParams.get("to"));

  const accounts = await prisma.brokerAccount.findMany({
    where: { userId: session.user.id },
    select: { id: true, baseCurrency: true },
  });
  const baseById = new Map(accounts.map((a) => [a.id, a.baseCurrency]));

  const trips = await prisma.roundTrip.findMany({
    where: {
      brokerAccountId: { in: accounts.map((a) => a.id) },
      status: "CLOSED",
      ...(from || to
        ? { closedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
    include: {
      instrument: {
        select: { symbol: true, underlyingSymbol: true, secType: true },
      },
      executions: {
        select: { fifoPnlRealized: true, commission: true, fxRateToBase: true },
      },
    },
    orderBy: [{ closedAt: "asc" }],
  });

  const headers = [
    "Clôture",
    "Ouverture",
    "Symbole",
    "Type",
    "Sens",
    "Quantité",
    "P&L brut (base)",
    "Frais (base)",
    "P&L net (base)",
    "Devise",
    "Stratégie",
    "Tags",
    "Note",
    "Notes",
  ];

  const rows: CsvCell[][] = trips.map((t) => {
    let gross = 0;
    let fees = 0;
    for (const e of t.executions) {
      const fx = Number(e.fxRateToBase);
      if (e.fifoPnlRealized !== null) gross += Number(e.fifoPnlRealized) * fx;
      fees += Math.abs(Number(e.commission)) * fx;
    }
    return [
      t.closedAt?.toISOString().slice(0, 10) ?? "",
      t.openedAt.toISOString().slice(0, 10),
      t.instrument.secType === "OPT"
        ? (t.instrument.underlyingSymbol ?? t.instrument.symbol)
        : t.instrument.symbol,
      t.instrument.secType,
      t.direction,
      num(Number(t.maxQuantity), 0),
      num(gross),
      num(fees),
      num(gross - fees),
      baseById.get(t.brokerAccountId) ?? "",
      t.strategy ?? "",
      t.tags.join(" | "),
      t.rating ?? "",
      t.notes ?? "",
    ];
  });

  const range = from && to ? `-${url.searchParams.get("from")}_${url.searchParams.get("to")}` : "";
  return new Response(toCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="alert-desk-round-trips${range}.csv"`,
    },
  });
}
