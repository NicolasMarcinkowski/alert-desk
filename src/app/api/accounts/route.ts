import { prisma } from "@/lib/db/client";
import { seal } from "@/lib/crypto";
import {
  badRequest,
  requireSession,
  unauthorized,
} from "@/lib/api/validation";

export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const body = await request.json().catch(() => null);
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  const broker = body?.broker === "MANUAL" ? "MANUAL" : "IBKR";
  const flexToken =
    typeof body?.flexToken === "string" ? body.flexToken.trim() : "";
  const queryIdTradeConfirms =
    typeof body?.queryIdTradeConfirms === "string"
      ? body.queryIdTradeConfirms.trim()
      : "";
  const queryIdActivity =
    typeof body?.queryIdActivity === "string" ? body.queryIdActivity.trim() : "";
  const baseCurrency = body?.baseCurrency === "USD" ? "USD" : "EUR";

  if (!label || label.length > 60) return badRequest("label requis (max 60 caractères)");

  if (broker === "MANUAL") {
    const account = await prisma.brokerAccount.create({
      data: {
        userId: session.user.id,
        label,
        broker: "MANUAL",
        baseCurrency,
      },
      select: { id: true },
    });
    return Response.json({ id: account.id }, { status: 201 });
  }

  if (!flexToken) return badRequest("flexToken requis");
  if (!queryIdTradeConfirms && !queryIdActivity) {
    return badRequest("au moins un query ID requis");
  }

  const account = await prisma.brokerAccount.create({
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
