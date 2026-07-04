/**
 * Parser des relevés Flex (XML, données en attributs).
 * Tolère les deux dialectes IBKR : Activity (<Trade>, ibCommission, tradePrice…)
 * et Trade Confirms (<TradeConfirm>, commission, price…).
 *
 * Règle : ne JAMAIS parser les symboles d'options — les champs structurés
 * (strike/expiry/putCall/underlyingSymbol) suffisent.
 */

import { XMLParser } from "fast-xml-parser";
import {
  DEFAULT_ACCOUNT_TIMEZONE,
  normalizeFlexDate,
  parseFlexDateTime,
} from "./time";
import type {
  FlexAssetCategory,
  FlexBuySell,
  FlexCashBalanceRow,
  FlexCashTransactionRow,
  FlexCorporateActionRow,
  FlexEquitySummaryRow,
  FlexInstrumentRef,
  FlexOpenPositionRow,
  FlexPutCall,
  FlexTradeRow,
  ParsedFlexStatement,
} from "./types";

type Attrs = Record<string, string>;

const ARRAY_TAGS = new Set([
  "FlexStatement",
  "Trade",
  "TradeConfirm",
  "Confirm",
  "OpenPosition",
  "EquitySummaryByReportDateInBase",
  "CashReportCurrency",
  "CashTransaction",
  "CorporateAction",
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: false,
  parseTagValue: false,
  isArray: (name) => ARRAY_TAGS.has(name),
});

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function num(v: unknown): string | undefined {
  const s = str(v);
  if (s == null) return undefined;
  return Number.isNaN(Number(s)) ? undefined : s;
}

function mapAssetCategory(raw: string | undefined): FlexAssetCategory {
  if (raw === "STK") return "STK";
  if (raw === "OPT" || raw === "FOP") return "OPT";
  if (raw === "CASH") return "CASH";
  return "OTHER";
}

function mapPutCall(raw: string | undefined): FlexPutCall | undefined {
  if (!raw) return undefined;
  if (raw === "P" || raw === "PUT") return "PUT";
  if (raw === "C" || raw === "CALL") return "CALL";
  return undefined;
}

function mapBuySell(raw: string | undefined): FlexBuySell | undefined {
  if (!raw) return undefined;
  // Lignes d'annulation IBKR ("BUY (Ca.)" / "SELL (Ca.)") : quantité inverse
  // qui matérialise un bust — les importer comme fills normaux doublerait la
  // position au lieu de l'annuler. On les ignore ; le relevé Activity du
  // lendemain reflète l'état corrigé.
  if (raw.includes("(Ca")) return undefined;
  if (raw.startsWith("BUY")) return "BUY";
  if (raw.startsWith("SELL")) return "SELL";
  return undefined;
}

function instrumentRef(a: Attrs): FlexInstrumentRef | undefined {
  const conid = str(a.conid);
  const symbol = str(a.symbol);
  if (!conid || !symbol) return undefined;
  return {
    conid,
    symbol,
    assetCategory: mapAssetCategory(str(a.assetCategory)),
    description: str(a.description),
    currency: str(a.currency) ?? "USD",
    multiplier: num(a.multiplier),
    strike: num(a.strike),
    expiry: normalizeFlexDate(str(a.expiry)),
    putCall: mapPutCall(str(a.putCall)),
    underlyingConid: str(a.underlyingConid),
    underlyingSymbol: str(a.underlyingSymbol),
    exchange: str(a.listingExchange) ?? str(a.exchange),
    isin: str(a.isin),
  };
}

function parseTradeRow(a: Attrs, timeZone: string): FlexTradeRow | undefined {
  const instrument = instrumentRef(a);
  const buySell = mapBuySell(str(a.buySell));
  const quantityRaw = num(a.quantity);
  const price = num(a.tradePrice) ?? num(a.price);
  const tradeDate = normalizeFlexDate(str(a.tradeDate));
  if (!instrument || !buySell || !quantityRaw || !price || !tradeDate) {
    return undefined;
  }
  const tradeTimeUtc =
    parseFlexDateTime(str(a.dateTime), timeZone) ??
    parseFlexDateTime(tradeDate, timeZone)!;
  // Les quantités Flex sont signées (SELL négatif) — on stocke l'absolu
  const quantity = String(Math.abs(Number(quantityRaw)));
  return {
    instrument,
    buySell,
    quantity,
    price,
    proceeds: num(a.proceeds),
    commission: num(a.ibCommission) ?? num(a.commission) ?? "0",
    commissionCurrency:
      str(a.ibCommissionCurrency) ?? str(a.commissionCurrency) ?? instrument.currency,
    currency: instrument.currency,
    fxRateToBase: num(a.fxRateToBase) ?? "1",
    tradeDate,
    tradeTimeUtc,
    settleDate: normalizeFlexDate(str(a.settleDateTarget) ?? str(a.settleDate)),
    openCloseCode: str(a.openCloseIndicator) ?? str(a.code),
    codes: str(a.notes) ?? str(a.codes),
    fifoPnlRealized: num(a.fifoPnlRealized),
    ibExecId: str(a.ibExecID) ?? str(a.execID),
    ibOrderId: str(a.ibOrderID) ?? str(a.orderID),
    transactionId: str(a.transactionID) ?? str(a.tradeID),
  };
}

function parseOpenPosition(a: Attrs): FlexOpenPositionRow | undefined {
  // Les relevés peuvent contenir des lignes par lot — on ne garde que le résumé
  const lod = str(a.levelOfDetail);
  if (lod && lod !== "SUMMARY") return undefined;
  const instrument = instrumentRef(a);
  const quantity = num(a.position);
  const markPrice = num(a.markPrice);
  if (!instrument || !quantity || !markPrice) return undefined;
  return {
    instrument,
    quantity,
    markPrice,
    costBasisPrice: num(a.costBasisPrice) ?? "0",
    positionValue: num(a.positionValue) ?? "0",
    unrealizedPnl: num(a.fifoPnlUnrealized) ?? "0",
    currency: instrument.currency,
    fxRateToBase: num(a.fxRateToBase) ?? "1",
    reportDate: normalizeFlexDate(str(a.reportDate)),
  };
}

function parseEquitySummary(a: Attrs): FlexEquitySummaryRow | undefined {
  const reportDate = normalizeFlexDate(str(a.reportDate));
  const nav = num(a.total);
  if (!reportDate || !nav) return undefined;
  return {
    reportDate,
    nav,
    cash: num(a.cash) ?? "0",
    stockValue: num(a.stock) ?? "0",
    optionValue: num(a.options) ?? "0",
  };
}

function parseCashBalance(a: Attrs): FlexCashBalanceRow | undefined {
  const currency = str(a.currency);
  if (!currency || currency === "BASE_SUMMARY") return undefined;
  const amount = num(a.endingCash) ?? num(a.endingSettledCash);
  if (!amount) return undefined;
  return {
    currency,
    amount,
    fxRateToBase: num(a.fxRateToBase) ?? "1",
    date: normalizeFlexDate(str(a.toDate) ?? str(a.reportDate)),
  };
}

function parseCashTransaction(
  a: Attrs,
  timeZone: string
): FlexCashTransactionRow | undefined {
  const rawType = str(a.type);
  const amount = num(a.amount);
  const dateTimeUtc = parseFlexDateTime(
    str(a.dateTime) ?? str(a.reportDate),
    timeZone
  );
  const transactionId = str(a.transactionID);
  if (!rawType || !amount || !dateTimeUtc || !transactionId) return undefined;
  return {
    instrument: instrumentRef(a),
    rawType,
    amount,
    currency: str(a.currency) ?? "USD",
    fxRateToBase: num(a.fxRateToBase) ?? "1",
    dateTimeUtc,
    description: str(a.description),
    transactionId,
  };
}

function parseCorporateAction(a: Attrs): FlexCorporateActionRow | undefined {
  const rawType = str(a.type) ?? str(a.actionDescription);
  const transactionId = str(a.transactionID) ?? str(a.actionID);
  if (!rawType || !transactionId) return undefined;
  return {
    instrument: instrumentRef(a),
    rawType,
    description: str(a.description) ?? str(a.actionDescription),
    reportDate: normalizeFlexDate(str(a.reportDate)),
    quantity: num(a.quantity),
    value: num(a.value) ?? num(a.proceeds),
    transactionId,
  };
}

function collect<T>(
  section: unknown,
  childNames: string[],
  map: (attrs: Attrs) => T | undefined
): T[] {
  if (!section || typeof section !== "object") return [];
  const out: T[] = [];
  for (const name of childNames) {
    const children = (section as Record<string, unknown>)[name];
    if (!Array.isArray(children)) continue;
    for (const child of children) {
      const row = map(child as Attrs);
      if (row) out.push(row);
    }
  }
  return out;
}

/**
 * Parse un XML FlexQueryResponse complet (Activity ou Trade Confirms).
 * Retourne un statement par compte présent dans le relevé.
 */
export function parseFlexXml(
  xml: string,
  opts: { accountTimeZone?: string } = {}
): ParsedFlexStatement[] {
  const timeZone = opts.accountTimeZone ?? DEFAULT_ACCOUNT_TIMEZONE;
  const doc = parser.parse(xml);
  const response = doc.FlexQueryResponse;
  if (!response) {
    throw new Error("XML inattendu : pas de FlexQueryResponse");
  }
  const statements: unknown[] = response.FlexStatements?.FlexStatement ?? [];

  return statements.map((stmt) => {
    const s = stmt as Record<string, unknown>;
    const accountId = str(s.accountId);
    if (!accountId) {
      throw new Error("FlexStatement sans accountId");
    }

    const changeInNav = s.ChangeInNAV as Attrs | undefined;

    return {
      accountId,
      fromDate: normalizeFlexDate(str(s.fromDate)),
      toDate: normalizeFlexDate(str(s.toDate)),
      trades: [
        ...collect(s.Trades, ["Trade"], (a) => parseTradeRow(a, timeZone)),
        ...collect(s.TradeConfirms, ["TradeConfirm", "Confirm"], (a) =>
          parseTradeRow(a, timeZone)
        ),
      ],
      openPositions: collect(s.OpenPositions, ["OpenPosition"], parseOpenPosition),
      equitySummaries: collect(
        s.EquitySummaryInBase,
        ["EquitySummaryByReportDateInBase"],
        parseEquitySummary
      ),
      cashBalances: collect(s.CashReport, ["CashReportCurrency"], parseCashBalance),
      cashTransactions: collect(s.CashTransactions, ["CashTransaction"], (a) =>
        parseCashTransaction(a, timeZone)
      ),
      corporateActions: collect(
        s.CorporateActions,
        ["CorporateAction"],
        parseCorporateAction
      ),
      depositsWithdrawals: changeInNav
        ? num(changeInNav.depositsWithdrawals)
        : undefined,
    };
  });
}
