import { prisma } from "@/lib/db/client";
import { open } from "@/lib/crypto";
import { FlexError, validateFlexQuery } from "@/lib/flex/client";
import { requireSession, unauthorized } from "@/lib/api/validation";

/** Dry-run SendRequest sur chaque query du compte (sans télécharger le relevé). */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { id } = await params;

  const account = await prisma.ibkrAccount.findFirst({
    where: { id, userId: session.user.id },
    include: { flexQueries: { where: { enabled: true } } },
  });
  if (!account) return unauthorized();

  const token = open(account.flexTokenEncrypted);
  const results: { queryId: string; type: string; ok: boolean; error?: string }[] =
    [];

  for (const query of account.flexQueries) {
    try {
      await validateFlexQuery(token, query.queryId);
      results.push({ queryId: query.queryId, type: query.type, ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (e instanceof FlexError && e.kind === "AUTH") {
        await prisma.ibkrAccount.update({
          where: { id },
          data: { status: "AUTH_ERROR" },
        });
      }
      results.push({
        queryId: query.queryId,
        type: query.type,
        ok: false,
        error: message,
      });
    }
  }

  const allOk = results.length > 0 && results.every((r) => r.ok);
  if (allOk && account.status === "AUTH_ERROR") {
    await prisma.ibkrAccount.update({
      where: { id },
      data: { status: "ACTIVE" },
    });
  }

  return Response.json({ ok: allOk, results });
}
