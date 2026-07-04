/**
 * Orchestration des synchronisations Flex.
 *
 * Garde-fous :
 *  - cooldown 2 min par (compte, kind) sur les runs manuels
 *  - mutex : refus si un SyncRun RUNNING de moins de 10 min existe
 *  - sweep au démarrage : les RUNNING > 10 min (crash) passent en ERROR
 *  - sérialisation par compte via chaîne de promesses en mémoire
 *    (un seul conteneur en prod — pattern rate-limiter team-lol-stats)
 */

import { prisma } from "@/lib/db/client";
import type { ExecutionSource, SyncTrigger } from "@/generated/prisma";
import { open } from "@/lib/crypto";
import { FlexError, fetchFlexStatement } from "@/lib/flex/client";
import { parseFlexXml } from "@/lib/flex/parser";
import type { ParsedFlexStatement } from "@/lib/flex/types";
import { emptyCounters, importStatement, type ImportCounters } from "./import";
import { reconcilePositions } from "./reconcile";
import { rebuildRoundTrips } from "./round-trips";

const COOLDOWN_MS = 2 * 60 * 1000;
const STALE_RUNNING_MS = 10 * 60 * 1000;

/** Chaîne de sérialisation par compte (survit au hot-reload dev). */
const globalChains = globalThis as unknown as {
  __alertDeskSyncChains?: Map<string, Promise<unknown>>;
};
const chains =
  globalChains.__alertDeskSyncChains ?? new Map<string, Promise<unknown>>();
globalChains.__alertDeskSyncChains = chains;

function serialize<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  chains.set(
    key,
    next.catch(() => undefined)
  );
  return next;
}

export type SyncKindInput = "TRADE_CONFIRMS" | "ACTIVITY";

export interface SyncAccountResult {
  brokerAccountId: string;
  label: string;
  status: "SUCCESS" | "ERROR" | "SKIPPED";
  message?: string;
  counters: ImportCounters;
  warnings: string[];
}

/** Marque en ERROR les runs RUNNING laissés par un crash. */
export async function sweepStaleSyncRuns(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS);
  const res = await prisma.syncRun.updateMany({
    where: { status: "RUNNING", startedAt: { lt: cutoff } },
    data: {
      status: "ERROR",
      finishedAt: new Date(),
      errors: "Interrompu (sweep au démarrage — crash probable)",
    },
  });
  return res.count;
}

/**
 * Chemin d'import partagé (fetch Flex ET import XML manuel) :
 * bronze → parse → import → réconciliation → round-trips.
 */
export async function processStatementXml(
  accountDbId: string,
  flexQueryId: string,
  referenceCode: string,
  xml: string,
  source: ExecutionSource
): Promise<{ counters: ImportCounters; warnings: string[] }> {
  const raw = await prisma.flexStatementRaw.create({
    data: {
      brokerAccountId: accountDbId,
      flexQueryId,
      referenceCode,
      payload: xml,
    },
  });

  let statements: ParsedFlexStatement[];
  try {
    // Fuseau configuré sur le compte IBKR (horodatages Flex sans offset) —
    // surchargable via IBKR_ACCOUNT_TIMEZONE si le compte n'est pas sur NY
    statements = parseFlexXml(xml, {
      accountTimeZone: process.env.IBKR_ACCOUNT_TIMEZONE,
    });
  } catch (e) {
    await prisma.flexStatementRaw.update({
      where: { id: raw.id },
      data: { processedAt: new Date(), processedOk: false },
    });
    throw e;
  }

  let counters = emptyCounters();
  const warnings: string[] = [];

  const account = await prisma.brokerAccount.findUniqueOrThrow({
    where: { id: accountDbId },
  });

  for (const statement of statements) {
    // Apprentissage / contrôle du n° de compte côté broker
    if (!account.externalAccountId) {
      await prisma.brokerAccount.update({
        where: { id: accountDbId },
        data: { externalAccountId: statement.accountId },
      });
      account.externalAccountId = statement.accountId;
    } else if (account.externalAccountId !== statement.accountId) {
      throw new Error(
        `Le relevé concerne ${statement.accountId} mais le compte lié est ${account.externalAccountId}`
      );
    }

    const c = await importStatement(accountDbId, statement, source);
    counters = {
      fetched: counters.fetched + c.fetched,
      inserted: counters.inserted + c.inserted,
      updated: counters.updated + c.updated,
      duplicates: counters.duplicates + c.duplicates,
    };
  }

  await prisma.flexStatementRaw.update({
    where: { id: raw.id },
    data: {
      processedAt: new Date(),
      processedOk: true,
      fromDate: statements[0]?.fromDate
        ? new Date(`${statements[0].fromDate}T00:00:00Z`)
        : undefined,
      toDate: statements[0]?.toDate
        ? new Date(`${statements[0].toDate}T00:00:00Z`)
        : undefined,
    },
  });

  const reconcile = await reconcilePositions(accountDbId);
  warnings.push(...reconcile.warnings);
  await rebuildRoundTrips(accountDbId);

  return { counters, warnings };
}

async function syncOneAccount(
  accountDbId: string,
  kind: SyncKindInput,
  trigger: SyncTrigger,
  force: boolean
): Promise<SyncAccountResult> {
  const account = await prisma.brokerAccount.findUniqueOrThrow({
    where: { id: accountDbId },
    include: { flexQueries: { where: { type: kind, enabled: true } } },
  });

  const base: Omit<SyncAccountResult, "status"> = {
    brokerAccountId: account.id,
    label: account.label,
    counters: emptyCounters(),
    warnings: [],
  };

  if (account.status === "DISABLED") {
    return { ...base, status: "SKIPPED", message: "Compte désactivé" };
  }
  if (account.broker !== "IBKR" || !account.flexTokenEncrypted) {
    return { ...base, status: "SKIPPED", message: "Compte sans lien broker (manuel)" };
  }
  if (account.flexQueries.length === 0) {
    return {
      ...base,
      status: "SKIPPED",
      message: `Aucune Flex Query ${kind} configurée`,
    };
  }

  // Cooldown (sauf force)
  if (!force) {
    const lastRun = account.flexQueries
      .map((q) => q.lastRunAt?.getTime() ?? 0)
      .reduce((a, b) => Math.max(a, b), 0);
    if (Date.now() - lastRun < COOLDOWN_MS) {
      return {
        ...base,
        status: "SKIPPED",
        message: "Cooldown (dernière sync < 2 min)",
      };
    }
  }

  // Mutex : run encore vivant ?
  const running = await prisma.syncRun.findFirst({
    where: {
      brokerAccountId: account.id,
      kind,
      status: "RUNNING",
      startedAt: { gt: new Date(Date.now() - STALE_RUNNING_MS) },
    },
  });
  if (running) {
    return { ...base, status: "SKIPPED", message: "Sync déjà en cours" };
  }

  const run = await prisma.syncRun.create({
    data: { brokerAccountId: account.id, kind, trigger },
  });

  try {
    const token = open(account.flexTokenEncrypted);
    let counters = emptyCounters();
    const warnings: string[] = [];

    for (const query of account.flexQueries) {
      await prisma.flexQuery.update({
        where: { id: query.id },
        data: { lastRunAt: new Date() },
      });
      const { referenceCode, xml } = await fetchFlexStatement(
        token,
        query.queryId
      );
      const result = await processStatementXml(
        account.id,
        query.queryId,
        referenceCode,
        xml,
        kind === "ACTIVITY" ? "ACTIVITY" : "TRADE_CONFIRMS"
      );
      counters = {
        fetched: counters.fetched + result.counters.fetched,
        inserted: counters.inserted + result.counters.inserted,
        updated: counters.updated + result.counters.updated,
        duplicates: counters.duplicates + result.counters.duplicates,
      };
      warnings.push(...result.warnings);
      await prisma.flexQuery.update({
        where: { id: query.id },
        data: { lastSuccessAt: new Date() },
      });
    }

    // Un compte en AUTH_ERROR qui resynchronise avec succès redevient ACTIVE
    if (account.status === "AUTH_ERROR") {
      await prisma.brokerAccount.update({
        where: { id: account.id },
        data: { status: "ACTIVE" },
      });
    }

    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        itemsFetched: counters.fetched,
        itemsInserted: counters.inserted,
        itemsUpdated: counters.updated,
        duplicates: counters.duplicates,
        errors: warnings.length > 0 ? warnings.join("\n") : null,
      },
    });

    return { ...base, status: "SUCCESS", counters, warnings };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (e instanceof FlexError && e.kind === "AUTH") {
      await prisma.brokerAccount.update({
        where: { id: account.id },
        data: { status: "AUTH_ERROR" },
      });
    }
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "ERROR", finishedAt: new Date(), errors: message },
    });
    return { ...base, status: "ERROR", message };
  }
}

/**
 * Lance une sync pour un compte donné ou toute la flotte.
 * Les comptes sont traités séquentiellement (sérialisation par token).
 */
export async function runSync(options: {
  brokerAccountId?: string;
  /** Restreint aux comptes de cet utilisateur (sync manuelle) ; absent = flotte (cron) */
  userId?: string;
  kind: SyncKindInput;
  trigger: SyncTrigger;
  force?: boolean;
}): Promise<SyncAccountResult[]> {
  const accounts = await prisma.brokerAccount.findMany({
    where: {
      ...(options.brokerAccountId ? { id: options.brokerAccountId } : {}),
      ...(options.userId ? { userId: options.userId } : {}),
      ...(options.brokerAccountId
        ? {}
        : { status: { not: "DISABLED" }, broker: "IBKR" }),
    },
  });

  const results: SyncAccountResult[] = [];
  for (const account of accounts) {
    const result = await serialize(account.id, () =>
      syncOneAccount(
        account.id,
        options.kind,
        options.trigger,
        options.force ?? false
      )
    );
    results.push(result);
  }
  return results;
}
