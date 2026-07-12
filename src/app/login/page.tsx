import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { Logo } from "@/components/ui/Logo";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="flex w-95 flex-col gap-7">
        <div className="flex flex-col items-center gap-3">
          <Logo size={44} />
          <div className="text-center">
            <h1 className="text-lg font-bold tracking-widest">ALERT DESK</h1>
            <p className="text-sm text-ink-soft">
              Surveillance de marché · Journal de trading
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-edge bg-surface p-6">
          <h2 className="mb-1 text-base font-semibold">Connexion</h2>
          <p className="mb-5 text-sm text-ink-soft">
            Accès restreint à l&apos;allowlist configurée dans les réglages.
            L&apos;authentification est déléguée à Google.
          </p>

          {error === "AccessDenied" && (
            <p className="mb-4 rounded-lg border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
              Ce compte Google n&apos;est pas dans la liste des emails
              autorisés.
            </p>
          )}

          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="flex w-full cursor-pointer items-center justify-center gap-3 rounded-lg border border-edge bg-surface-2 px-4 py-2.5 text-sm font-medium transition-colors hover:border-accent/50 hover:bg-surface-2/80"
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.97 10.97 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Se connecter avec Google
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-ink-mute">
          Observation uniquement — aucun ordre n&apos;est exécuté.
        </p>
      </div>
    </div>
  );
}
