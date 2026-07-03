import {
  addManualExecution,
  ManualOrderError,
  type ManualOrderInput,
} from "@/lib/manual-orders";
import {
  badRequest,
  requireSession,
  unauthorized,
} from "@/lib/api/validation";

/** Saisie manuelle d'un ordre exécuté (compte manuel). */
export async function POST(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const body = await request.json().catch(() => null);
  if (!body) return badRequest("corps JSON attendu");

  const side = body.side === "SELL" ? "SELL" : body.side === "BUY" ? "BUY" : null;
  const secType = ["STK", "OPT", "OTHER"].includes(body.secType)
    ? body.secType
    : null;
  const symbol =
    typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  const currency =
    typeof body.currency === "string" && /^[A-Z]{3}$/.test(body.currency)
      ? body.currency
      : null;
  const quantity = Number(body.quantity);
  const price = Number(body.price);
  const fees = Number(body.fees ?? 0);

  if (!side || !secType) return badRequest("side/secType invalides");
  if (!symbol || !/^[A-Z0-9.\-]{1,12}$/.test(symbol)) {
    return badRequest("symbole invalide");
  }
  if (!currency) return badRequest("devise invalide (code ISO, ex. USD)");
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return badRequest("quantité invalide");
  }
  if (!Number.isFinite(price) || price <= 0) return badRequest("prix invalide");
  if (!Number.isFinite(fees) || fees < 0) return badRequest("frais invalides");
  if (typeof body.tradeAt !== "string") return badRequest("date requise");

  if (secType === "OPT") {
    if (
      !Number.isFinite(Number(body.strike)) ||
      Number(body.strike) <= 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.expiry ?? "") ||
      !["PUT", "CALL"].includes(body.putCall)
    ) {
      return badRequest("option incomplète (strike, échéance, call/put)");
    }
  }

  const input: ManualOrderInput = {
    accountId: typeof body.accountId === "string" ? body.accountId : undefined,
    side,
    secType,
    symbol,
    currency,
    quantity,
    price,
    fees,
    tradeAt: body.tradeAt,
    fxRateToBase:
      Number(body.fxRateToBase) > 0 ? Number(body.fxRateToBase) : undefined,
    strike: secType === "OPT" ? Number(body.strike) : undefined,
    expiry: secType === "OPT" ? body.expiry : undefined,
    putCall: secType === "OPT" ? body.putCall : undefined,
    multiplier:
      Number(body.multiplier) > 0 ? Number(body.multiplier) : undefined,
  };

  try {
    const result = await addManualExecution(session.user.id, input);
    return Response.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof ManualOrderError) return badRequest(e.message);
    throw e;
  }
}
