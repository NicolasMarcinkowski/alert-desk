/**
 * Client Flex Web Service IBKR — flux en deux temps :
 *   1. SendRequest(token, queryId) → ReferenceCode
 *   2. GetStatement(referenceCode)  → XML du relevé (poll tant que 1019)
 *
 * Codes d'erreur notables :
 *   1012/1013/1015 : token invalide/expiré/IP refusée → AUTH (statut compte AUTH_ERROR)
 *   1018 : throttle → RATE_LIMITED (retenter plus tard)
 *   1019 : génération en cours → poll avec backoff
 */

import { XMLParser } from "fast-xml-parser";

const SEND_REQUEST_URL =
  "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest";
const USER_AGENT = "alert-desk/0.1 (self-hosted trading tracker)";

const AUTH_ERROR_CODES = new Set(["1012", "1013", "1015"]);
const PENDING_CODES = new Set(["1019"]);
const RATE_LIMIT_CODES = new Set(["1018"]);

/** Backoff de poll GetStatement, cap total ≈ 4 min */
const POLL_DELAYS_MS = [5_000, 10_000, 20_000, 30_000, 30_000, 30_000, 30_000, 30_000, 30_000, 30_000];

export type FlexErrorKind = "AUTH" | "RATE_LIMITED" | "TIMEOUT" | "PROTOCOL";

export class FlexError extends Error {
  readonly kind: FlexErrorKind;
  readonly code?: string;

  constructor(kind: FlexErrorKind, message: string, code?: string) {
    super(message);
    this.name = "FlexError";
    this.kind = kind;
    this.code = code;
  }
}

const envelopeParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: false,
  parseTagValue: false,
});

interface StatementResponseEnvelope {
  Status?: string;
  ReferenceCode?: string;
  Url?: string;
  ErrorCode?: string | number;
  ErrorMessage?: string;
}

function parseEnvelope(xml: string): StatementResponseEnvelope | null {
  try {
    const doc = envelopeParser.parse(xml);
    return (doc.FlexStatementResponse as StatementResponseEnvelope) ?? null;
  } catch {
    return null;
  }
}

async function flexGet(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/xml" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new FlexError(
      "PROTOCOL",
      `Flex HTTP ${res.status} ${res.statusText}`
    );
  }
  return res.text();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function throwFromEnvelope(env: StatementResponseEnvelope): never {
  const code = env.ErrorCode != null ? String(env.ErrorCode) : undefined;
  const message = env.ErrorMessage ?? `Flex error (code ${code ?? "?"})`;
  if (code && AUTH_ERROR_CODES.has(code)) {
    throw new FlexError("AUTH", message, code);
  }
  if (code && RATE_LIMIT_CODES.has(code)) {
    throw new FlexError("RATE_LIMITED", message, code);
  }
  throw new FlexError("PROTOCOL", message, code);
}

export interface FlexFetchResult {
  referenceCode: string;
  xml: string;
}

/**
 * Validation légère (bouton « Tester ») : SendRequest seul, sans télécharger
 * le relevé. Lève FlexError si token/query invalides.
 */
export async function validateFlexQuery(
  token: string,
  queryId: string
): Promise<{ referenceCode: string }> {
  const xml = await flexGet(
    `${SEND_REQUEST_URL}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`
  );
  const env = parseEnvelope(xml);
  if (!env) {
    throw new FlexError("PROTOCOL", "Réponse SendRequest illisible");
  }
  if (env.Status !== "Success" || !env.ReferenceCode) {
    throwFromEnvelope(env);
  }
  return { referenceCode: env.ReferenceCode };
}

/**
 * Récupère un relevé complet (SendRequest + poll GetStatement).
 * Lève FlexError typée pour que l'orchestrateur ajuste le statut du compte.
 */
export async function fetchFlexStatement(
  token: string,
  queryId: string
): Promise<FlexFetchResult> {
  // 1. SendRequest
  const sendXml = await flexGet(
    `${SEND_REQUEST_URL}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`
  );
  const sendEnv = parseEnvelope(sendXml);
  if (!sendEnv) {
    throw new FlexError("PROTOCOL", "Réponse SendRequest illisible");
  }
  if (sendEnv.Status !== "Success" || !sendEnv.ReferenceCode || !sendEnv.Url) {
    throwFromEnvelope(sendEnv);
  }

  const referenceCode = sendEnv.ReferenceCode;
  const statementUrl = `${sendEnv.Url}?q=${encodeURIComponent(referenceCode)}&t=${encodeURIComponent(token)}&v=3`;

  // 2. Poll GetStatement
  for (const delay of POLL_DELAYS_MS) {
    const xml = await flexGet(statementUrl);
    if (xml.includes("<FlexQueryResponse")) {
      return { referenceCode, xml };
    }
    const env = parseEnvelope(xml);
    const code = env?.ErrorCode != null ? String(env.ErrorCode) : undefined;
    if (env && code && PENDING_CODES.has(code)) {
      await sleep(delay);
      continue;
    }
    if (env) {
      throwFromEnvelope(env);
    }
    throw new FlexError("PROTOCOL", "Réponse GetStatement illisible");
  }

  throw new FlexError(
    "TIMEOUT",
    "Le relevé Flex n'a pas été généré dans le temps imparti (~4 min)"
  );
}
