import { prisma } from "@/lib/db/client";
import { requireSession, unauthorized } from "@/lib/api/validation";
import { toCsv, num, type CsvCell } from "@/lib/export/csv";

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
 * Export CSV des exécutions (fills) — détail transactionnel brut.
 * Filtre optionnel par date de trade : ?from=YYYY-MM-DD&to=YYYY-MM-DD.
 */
export async function GET(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const from = parseFrom(url.searchParams.get("from"));
  const to = parseTo(url.searchParams.get("to"));

  const accountIds = (
    await prisma.brokerAccount.findMany({
      where: { userId: session.user.id },
      select: { id: true },
    })
  ).map((a) => a.id);

  const executions = await prisma.execution.findMany({
    where: {
      brokerAccountId: { in: accountIds },
      ...(from || to
        ? { tradeDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
    include: { instrument: { select: { symbol: true, secType: true } } },
    orderBy: [{ tradeDate: "asc" }, { tradeTime: "asc" }],
  });

  const headers = [
    "Date",
    "Heure (UTC)",
    "Sens",
    "Symbole",
    "Type",
    "Quantité",
    "Prix",
    "Montant",
    "Commission",
    "Devise",
    "FX→base",
    "Source",
    "P&L réalisé (natif)",
  ];

  const rows: CsvCell[][] = executions.map((e) => [
    e.tradeDate.toISOString().slice(0, 10),
    e.tradeTime ? e.tradeTime.toISOString().slice(11, 19) : "",
    e.side,
    e.instrument.symbol,
    e.instrument.secType,
    num(Number(e.quantity), 4),
    num(Number(e.price), 4),
    num(Number(e.proceeds), 2),
    num(Number(e.commission), 2),
    e.currency,
    num(Number(e.fxRateToBase), 6),
    e.source,
    e.fifoPnlRealized !== null ? num(Number(e.fifoPnlRealized), 2) : "",
  ]);

  const range = from && to ? `-${url.searchParams.get("from")}_${url.searchParams.get("to")}` : "";
  return new Response(toCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="alert-desk-executions${range}.csv"`,
    },
  });
}
