import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./db/client";

/**
 * Emails autorisés à se connecter (ALLOWED_EMAILS, séparés par des virgules).
 * Fail-closed : liste vide → personne ne passe.
 */
function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Noms d'env alignés sur palato-scoring (NEXTAUTH_*, lus aussi par Auth.js v5)
  secret: process.env.NEXTAUTH_SECRET,
  // Derrière le reverse proxy du NAS — remplace AUTH_TRUST_HOST=true
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user }) {
      return isEmailAllowed(user.email);
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      // Ré-évaluée à chaque requête : retirer un email de ALLOWED_EMAILS
      // révoque la session JWT immédiatement (sinon accès résiduel ~30 j)
      if (!isEmailAllowed(token.email)) {
        return null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});

// Type augmentation for session
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
