import { requireSession, unauthorized } from "@/lib/api/validation";
import { quoteCache } from "@/lib/marketdata/quote-cache";
import { sseHub } from "@/lib/engine/sse-hub";
import { getUserSymbolKeys } from "@/lib/engine/user-symbols";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

/**
 * Flux SSE : snapshot initial filtré (symboles de l'utilisateur uniquement)
 * puis événements nommés `quotes` (lots coalescés), `alert`, `sync`.
 * Heartbeat 25 s contre les timeouts du reverse proxy ; headers
 * anti-buffering pour le NAS.
 */
export async function GET(request: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const symbols = await getUserSymbolKeys(session.user.id);
  const encoder = new TextEncoder();
  let clientId: number | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      clientId = sseHub.register(session.user.id, symbols, send);
      send(
        "snapshot",
        quoteCache.snapshot().filter((q) => symbols.has(q.symbol))
      );

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          // contrôleur fermé — le cleanup arrive via abort
        }
      }, HEARTBEAT_MS);

      request.signal.addEventListener("abort", () => {
        if (heartbeat) clearInterval(heartbeat);
        if (clientId !== null) sseHub.unregister(clientId);
        try {
          controller.close();
        } catch {
          // déjà fermé
        }
      });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (clientId !== null) sseHub.unregister(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
