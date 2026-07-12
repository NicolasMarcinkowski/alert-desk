import { NextResponse, type NextRequest } from "next/server";

/**
 * Filet de sécurité « tout est privé par défaut » : toute route hors
 * allowlist exige le cookie de session Auth.js, sinon redirect /login
 * (401 pour les API). La vérification cryptographique réelle reste dans
 * le layout (app) et les routes API (requireSession) — le PrismaAdapter
 * d'auth.ts interdit d'appeler auth() ici (runtime edge). Ce middleware
 * garantit seulement qu'une future page créée hors du groupe (app) ne
 * sera jamais publique par accident.
 */

const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth", // NextAuth (signin, callback, csrf…)
  "/api/cron", // authentifié par CRON_SECRET dans la route
  "/api/admin", // authentifié par ADMIN_TOKEN dans la route
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const hasSessionCookie =
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token");

  if (hasSessionCookie) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.nextUrl);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Tout sauf les assets Next et les fichiers statiques
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|svg|jpg|ico|webmanifest)$).*)"],
};
