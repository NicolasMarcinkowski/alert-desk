import {
  deleteManualExecution,
  ManualOrderError,
} from "@/lib/manual-orders";
import {
  badRequest,
  requireSession,
  unauthorized,
} from "@/lib/api/validation";

/** Suppression d'une exécution saisie manuellement (correction d'erreur). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { id } = await params;

  try {
    await deleteManualExecution(session.user.id, id);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof ManualOrderError) return badRequest(e.message);
    throw e;
  }
}
