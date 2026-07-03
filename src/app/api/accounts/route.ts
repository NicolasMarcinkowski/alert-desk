import { prisma } from "@/lib/db/client";
import { seal } from "@/lib/crypto";
import {
  badRequest,
  requireSession,
  unauthorized,
} from "@/lib/api/validation";

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();

  const accounts = await prisma.ibkrAccount.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      label: true,
      ibkrAccountId: true,
      baseCurrency: true,
      status: true,
      createdAt: true,
      flexQueries: {
        select: {
          id: true,
          queryId: true,
          type: true,
          enabled: true,
          lastRunAt: true,
          lastSuccessAt: true,
        },
      },
    },
  });
  return Response.json({ accounts });
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const body = await request.json().catch(() => null);
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  const flexToken =
    typeof body?.flexToken === "string" ? body.flexToken.trim() : "";
  const queryIdTradeConfirms =
    typeof body?.queryIdTradeConfirms === "string"
      ? body.queryIdTradeConfirms.trim()
      : "";
  const queryIdActivity =
    typeof body?.queryIdActivity === "string" ? body.queryIdActivity.trim() : "";
  const baseCurrency = body?.baseCurrency === "USD" ? "USD" : "EUR";

  if (!label) return badRequest("label requis");
  if (!flexToken) return badRequest("flexToken requis");
  if (!queryIdTradeConfirms && !queryIdActivity) {
    return badRequest("au moins un query ID requis");
  }

  const account = await prisma.ibkrAccount.create({
    data: {
      userId: session.user.id,
      label,
      baseCurrency,
      flexTokenEncrypted: seal(flexToken),
      flexQueries: {
        create: [
          ...(queryIdTradeConfirms
            ? [
                {
                  queryId: queryIdTradeConfirms,
                  type: "TRADE_CONFIRMS" as const,
                },
              ]
            : []),
          ...(queryIdActivity
            ? [{ queryId: queryIdActivity, type: "ACTIVITY" as const }]
            : []),
        ],
      },
    },
    select: { id: true },
  });

  return Response.json({ id: account.id }, { status: 201 });
}
