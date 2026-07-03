/**
 * Garde-fous des routes API.
 *  - validateAuthToken : Bearer contre CRON_SECRET / ADMIN_TOKEN, fail-closed
 *    (variable absente → refus), comparaison à temps constant.
 *  - requireSession : session Auth.js ou null (la route renvoie 401).
 */

import { timingSafeEqual } from "crypto";
import { auth } from "@/lib/auth";

export function validateAuthToken(
  request: Request,
  envVar: "CRON_SECRET" | "ADMIN_TOKEN"
): boolean {
  const secret = process.env[envVar];
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const token = header.slice(7);

  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session;
}

export function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}
