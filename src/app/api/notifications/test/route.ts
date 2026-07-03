import { dispatchToUser } from "@/lib/notify/dispatch";
import { requireSession, unauthorized } from "@/lib/api/validation";

/** Envoie un message de test sur les canaux configurés de l'utilisateur. */
export async function POST() {
  const session = await requireSession();
  if (!session) return unauthorized();

  const deliveries = await dispatchToUser(
    session.user.id,
    { telegram: true, discord: true },
    "ALERT DESK — message de test. Les notifications fonctionnent."
  );

  if (Object.keys(deliveries).length === 0) {
    return Response.json(
      { error: "Aucun canal configuré (Telegram ou Discord)" },
      { status: 400 }
    );
  }
  return Response.json({ deliveries });
}
