"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "done" | "error">(
    "idle"
  );

  async function handleSync() {
    setState("running");
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      const hasError =
        !res.ok ||
        (data.results ?? []).some(
          (r: { status: string }) => r.status === "ERROR"
        );
      setState(hasError ? "error" : "done");
      router.refresh();
    } catch {
      setState("error");
    } finally {
      setTimeout(() => setState("idle"), 4000);
    }
  }

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        title="Relie d'abord un compte IBKR dans les réglages"
        className="cursor-not-allowed rounded-lg border border-edge bg-surface px-3 py-1.5 text-xs font-medium text-ink-mute"
      >
        Sync
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleSync}
      disabled={state === "running"}
      className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
        state === "error"
          ? "border-loss/50 text-loss"
          : state === "done"
            ? "border-gain/50 text-gain"
            : "border-edge bg-surface hover:border-accent/50"
      } disabled:cursor-wait disabled:opacity-60`}
    >
      {state === "running"
        ? "Sync…"
        : state === "done"
          ? "Sync OK"
          : state === "error"
            ? "Erreur sync"
            : "Sync"}
    </button>
  );
}
