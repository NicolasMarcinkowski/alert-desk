/**
 * Types normalisés issus du parsing des relevés Flex.
 * Les valeurs numériques restent des STRINGS (fidélité Decimal —
 * Prisma les accepte telles quelles pour les colonnes Decimal).
 */

export type FlexAssetCategory = "STK" | "OPT" | "CASH" | "OTHER";
export type FlexPutCall = "PUT" | "CALL";
export type FlexBuySell = "BUY" | "SELL";

/** Champs instrument portés par la plupart des lignes Flex. */
export interface FlexInstrumentRef {
  conid: string;
  symbol: string;
  assetCategory: FlexAssetCategory;
  description?: string;
  currency: string;
  multiplier?: string;
  strike?: string;
  /** yyyy-mm-dd */
  expiry?: string;
  putCall?: FlexPutCall;
  underlyingConid?: string;
  underlyingSymbol?: string;
  exchange?: string;
  isin?: string;
}

export interface FlexTradeRow {
  instrument: FlexInstrumentRef;
  buySell: FlexBuySell;
  /** Toujours positive */
  quantity: string;
  price: string;
  proceeds?: string;
  /** Signée comme IBKR la fournit (négative = coût) */
  commission: string;
  commissionCurrency: string;
  currency: string;
  fxRateToBase: string;
  /** yyyy-mm-dd */
  tradeDate: string;
  tradeTimeUtc: Date;
  /** yyyy-mm-dd */
  settleDate?: string;
  openCloseCode?: string;
  codes?: string;
  fifoPnlRealized?: string;
  ibExecId?: string;
  ibOrderId?: string;
  transactionId?: string;
}

export interface FlexOpenPositionRow {
  instrument: FlexInstrumentRef;
  /** Signée (négatif = short) */
  quantity: string;
  markPrice: string;
  costBasisPrice: string;
  positionValue: string;
  unrealizedPnl: string;
  currency: string;
  fxRateToBase: string;
  /** yyyy-mm-dd — date du relevé */
  reportDate?: string;
}

export interface FlexEquitySummaryRow {
  /** yyyy-mm-dd */
  reportDate: string;
  nav: string;
  cash: string;
  stockValue: string;
  optionValue: string;
}

export interface FlexCashBalanceRow {
  currency: string;
  amount: string;
  fxRateToBase: string;
  /** yyyy-mm-dd */
  date?: string;
}

export interface FlexCashTransactionRow {
  instrument?: FlexInstrumentRef;
  /** Type IBKR brut ("Dividends", "Withholding Tax", …) */
  rawType: string;
  amount: string;
  currency: string;
  fxRateToBase: string;
  dateTimeUtc: Date;
  description?: string;
  transactionId: string;
}

export interface FlexCorporateActionRow {
  instrument?: FlexInstrumentRef;
  rawType: string;
  description?: string;
  /** yyyy-mm-dd */
  reportDate?: string;
  quantity?: string;
  value?: string;
  transactionId: string;
}

export interface ParsedFlexStatement {
  accountId: string;
  /** yyyy-mm-dd */
  fromDate?: string;
  toDate?: string;
  trades: FlexTradeRow[];
  openPositions: FlexOpenPositionRow[];
  equitySummaries: FlexEquitySummaryRow[];
  cashBalances: FlexCashBalanceRow[];
  cashTransactions: FlexCashTransactionRow[];
  corporateActions: FlexCorporateActionRow[];
  /** Dépôts/retraits de la période (section Change in NAV) */
  depositsWithdrawals?: string;
}
