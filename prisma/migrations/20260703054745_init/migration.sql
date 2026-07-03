-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "app";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "flex_raw";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "trading";

-- CreateEnum
CREATE TYPE "trading"."AssetCategory" AS ENUM ('STK', 'OPT', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "trading"."PutCall" AS ENUM ('PUT', 'CALL');

-- CreateEnum
CREATE TYPE "trading"."OrderSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "trading"."ExecutionSource" AS ENUM ('TRADE_CONFIRMS', 'ACTIVITY');

-- CreateEnum
CREATE TYPE "trading"."RoundTripStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "trading"."TradeDirection" AS ENUM ('LONG', 'SHORT');

-- CreateEnum
CREATE TYPE "trading"."PositionState" AS ENUM ('SNAPSHOT_CONFIRMED', 'INTRADAY_ESTIMATED');

-- CreateEnum
CREATE TYPE "trading"."CashTransactionType" AS ENUM ('DIVIDEND', 'WITHHOLDING_TAX', 'INTEREST', 'BROKER_FEE', 'DEPOSIT_WITHDRAWAL', 'OTHER');

-- CreateEnum
CREATE TYPE "app"."FlexQueryType" AS ENUM ('TRADE_CONFIRMS', 'ACTIVITY');

-- CreateEnum
CREATE TYPE "app"."SyncKind" AS ENUM ('TRADE_CONFIRMS', 'ACTIVITY', 'RECONCILE');

-- CreateEnum
CREATE TYPE "app"."SyncTrigger" AS ENUM ('CRON', 'MANUAL');

-- CreateEnum
CREATE TYPE "app"."SyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'ERROR');

-- CreateEnum
CREATE TYPE "app"."IbkrAccountStatus" AS ENUM ('ACTIVE', 'AUTH_ERROR', 'DISABLED');

-- CreateEnum
CREATE TYPE "app"."NotificationChannelType" AS ENUM ('TELEGRAM', 'DISCORD');

-- CreateEnum
CREATE TYPE "app"."AlertRuleType" AS ENUM ('PRICE_ABOVE', 'PRICE_BELOW', 'PCT_CHANGE_DAY', 'POSITION_PNL_ABOVE', 'POSITION_PNL_BELOW');

-- CreateEnum
CREATE TYPE "app"."AlertState" AS ENUM ('ARMED', 'TRIGGERED', 'COOLDOWN', 'DISABLED');

-- CreateEnum
CREATE TYPE "app"."RearmMode" AS ENUM ('MANUAL', 'AUTO_ON_RECROSS', 'AUTO_AFTER_COOLDOWN');

-- CreateTable
CREATE TABLE "app"."users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "email_verified" TIMESTAMP(3),
    "image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."sessions" (
    "id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "app"."ibkr_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ibkr_account_id" TEXT,
    "base_currency" TEXT NOT NULL DEFAULT 'EUR',
    "flex_token_encrypted" TEXT NOT NULL,
    "status" "app"."IbkrAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ibkr_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."flex_queries" (
    "id" TEXT NOT NULL,
    "ibkr_account_id" TEXT NOT NULL,
    "query_id" TEXT NOT NULL,
    "type" "app"."FlexQueryType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMP(3),
    "last_success_at" TIMESTAMP(3),

    CONSTRAINT "flex_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."sync_runs" (
    "id" TEXT NOT NULL,
    "ibkr_account_id" TEXT,
    "kind" "app"."SyncKind" NOT NULL,
    "trigger" "app"."SyncTrigger" NOT NULL,
    "status" "app"."SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "items_fetched" INTEGER NOT NULL DEFAULT 0,
    "items_inserted" INTEGER NOT NULL DEFAULT 0,
    "items_updated" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."watchlists" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "watchlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."watchlist_items" (
    "id" TEXT NOT NULL,
    "watchlist_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "instrument_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "watchlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."alert_rules" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "app"."AlertRuleType" NOT NULL,
    "symbol" TEXT,
    "ibkr_account_id" TEXT,
    "instrument_id" TEXT,
    "threshold" DECIMAL(18,6) NOT NULL,
    "state" "app"."AlertState" NOT NULL DEFAULT 'ARMED',
    "rearmMode" "app"."RearmMode" NOT NULL DEFAULT 'AUTO_ON_RECROSS',
    "cooldown_seconds" INTEGER NOT NULL DEFAULT 900,
    "rearm_at" TIMESTAMP(3),
    "last_triggered_at" TIMESTAMP(3),
    "last_value" DECIMAL(18,6),
    "notify_telegram" BOOLEAN NOT NULL DEFAULT true,
    "notify_discord" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."alert_events" (
    "id" TEXT NOT NULL,
    "alert_rule_id" TEXT NOT NULL,
    "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observed_value" DECIMAL(18,6) NOT NULL,
    "message" TEXT NOT NULL,
    "deliveries" JSONB,

    CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."notification_channels" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "app"."NotificationChannelType" NOT NULL,
    "config_encrypted" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flex_raw"."flex_statement_raw" (
    "id" TEXT NOT NULL,
    "ibkr_account_id" TEXT NOT NULL,
    "flex_query_id" TEXT NOT NULL,
    "reference_code" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "from_date" DATE,
    "to_date" DATE,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "processed_ok" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "flex_statement_raw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trading"."instruments" (
    "id" TEXT NOT NULL,
    "conid" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "sec_type" "trading"."AssetCategory" NOT NULL,
    "description" TEXT,
    "currency" TEXT NOT NULL,
    "multiplier" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "underlying_conid" TEXT,
    "underlying_symbol" TEXT,
    "strike" DECIMAL(18,6),
    "expiry" DATE,
    "put_call" "trading"."PutCall",
    "occ_symbol" TEXT,
    "exchange" TEXT,
    "isin" TEXT,

    CONSTRAINT "instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trading"."executions" (
    "id" TEXT NOT NULL,
    "ibkr_account_id" TEXT NOT NULL,
    "instrument_id" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "ib_exec_id" TEXT,
    "ib_order_id" TEXT,
    "transaction_id" TEXT,
    "side" "trading"."OrderSide" NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "price" DECIMAL(18,6) NOT NULL,
    "proceeds" DECIMAL(18,4) NOT NULL,
    "commission" DECIMAL(18,4) NOT NULL,
    "commission_currency" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "fx_rate_to_base" DECIMAL(18,8) NOT NULL,
    "trade_date" DATE NOT NULL,
    "trade_time" TIMESTAMP(3) NOT NULL,
    "settle_date" DATE,
    "open_close_code" TEXT,
    "ibkr_codes" TEXT,
    "fifo_pnl_realized" DECIMAL(18,4),
    "source" "trading"."ExecutionSource" NOT NULL DEFAULT 'TRADE_CONFIRMS',
    "confirmed_by_activity" BOOLEAN NOT NULL DEFAULT false,
    "round_trip_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trading"."round_trips" (
    "id" TEXT NOT NULL,
    "ibkr_account_id" TEXT NOT NULL,
    "instrument_id" TEXT NOT NULL,
    "open_execution_key" TEXT NOT NULL,
    "status" "trading"."RoundTripStatus" NOT NULL DEFAULT 'OPEN',
    "direction" "trading"."TradeDirection" NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),
    "max_quantity" DECIMAL(18,4) NOT NULL,
    "realized_pnl" DECIMAL(18,4),
    "realized_pnl_base" DECIMAL(18,4),
    "commissions" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "pnl_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "strategy" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "rating" INTEGER,

    CONSTRAINT "round_trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trading"."positions" (
    "id" TEXT NOT NULL,
    "ibkr_account_id" TEXT NOT NULL,
    "instrument_id" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "avg_cost" DECIMAL(18,6) NOT NULL,
    "currency" TEXT NOT NULL,
    "fx_rate_to_base" DECIMAL(18,8) NOT NULL,
    "state" "trading"."PositionState" NOT NULL DEFAULT 'SNAPSHOT_CONFIRMED',
    "snapshot_date" DATE,
    "drift_detected" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trading"."position_snapshots" (
    "id" TEXT NOT NULL,
    "ibkr_account_id" TEXT NOT NULL,
    "instrument_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "mark_price" DECIMAL(18,6) NOT NULL,
    "cost_basis_price" DECIMAL(18,6) NOT NULL,
    "position_value" DECIMAL(18,4) NOT NULL,
    "unrealized_pnl" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "fx_rate_to_base" DECIMAL(18,8) NOT NULL,

    CONSTRAINT "position_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trading"."account_snapshots" (
    "id" TEXT NOT NULL,
    "ibkr_account_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "nav" DECIMAL(18,4) NOT NULL,
    "cash" DECIMAL(18,4) NOT NULL,
    "stock_value" DECIMAL(18,4) NOT NULL,
    "option_value" DECIMAL(18,4) NOT NULL,
    "deposits_withdrawals" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "fees" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "base_currency" TEXT NOT NULL,

    CONSTRAINT "account_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trading"."cash_balances" (
    "id" TEXT NOT NULL,
    "ibkr_account_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "fx_rate_to_base" DECIMAL(18,8) NOT NULL,

    CONSTRAINT "cash_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trading"."cash_transactions" (
    "id" TEXT NOT NULL,
    "ibkr_account_id" TEXT NOT NULL,
    "instrument_id" TEXT,
    "type" "trading"."CashTransactionType" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "fx_rate_to_base" DECIMAL(18,8) NOT NULL,
    "date_time" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "transaction_id" TEXT NOT NULL,

    CONSTRAINT "cash_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trading"."corporate_actions" (
    "id" TEXT NOT NULL,
    "ibkr_account_id" TEXT NOT NULL,
    "instrument_id" TEXT,
    "ibkr_type" TEXT NOT NULL,
    "description" TEXT,
    "report_date" DATE,
    "quantity" DECIMAL(18,4),
    "value" DECIMAL(18,4),
    "transaction_id" TEXT NOT NULL,

    CONSTRAINT "corporate_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "app"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "app"."accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "app"."sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "app"."verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "ibkr_accounts_ibkr_account_id_key" ON "app"."ibkr_accounts"("ibkr_account_id");

-- CreateIndex
CREATE INDEX "ibkr_accounts_user_id_idx" ON "app"."ibkr_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "flex_queries_ibkr_account_id_query_id_key" ON "app"."flex_queries"("ibkr_account_id", "query_id");

-- CreateIndex
CREATE INDEX "sync_runs_started_at_idx" ON "app"."sync_runs"("started_at");

-- CreateIndex
CREATE INDEX "sync_runs_status_idx" ON "app"."sync_runs"("status");

-- CreateIndex
CREATE INDEX "sync_runs_ibkr_account_id_kind_started_at_idx" ON "app"."sync_runs"("ibkr_account_id", "kind", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "watchlists_user_id_name_key" ON "app"."watchlists"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "watchlist_items_watchlist_id_symbol_key" ON "app"."watchlist_items"("watchlist_id", "symbol");

-- CreateIndex
CREATE INDEX "alert_rules_user_id_idx" ON "app"."alert_rules"("user_id");

-- CreateIndex
CREATE INDEX "alert_rules_state_idx" ON "app"."alert_rules"("state");

-- CreateIndex
CREATE INDEX "alert_rules_symbol_idx" ON "app"."alert_rules"("symbol");

-- CreateIndex
CREATE INDEX "alert_events_alert_rule_id_triggered_at_idx" ON "app"."alert_events"("alert_rule_id", "triggered_at");

-- CreateIndex
CREATE INDEX "alert_events_triggered_at_idx" ON "app"."alert_events"("triggered_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_channels_user_id_type_key" ON "app"."notification_channels"("user_id", "type");

-- CreateIndex
CREATE INDEX "flex_statement_raw_ibkr_account_id_fetched_at_idx" ON "flex_raw"."flex_statement_raw"("ibkr_account_id", "fetched_at");

-- CreateIndex
CREATE INDEX "flex_statement_raw_processed_ok_idx" ON "flex_raw"."flex_statement_raw"("processed_ok");

-- CreateIndex
CREATE UNIQUE INDEX "instruments_conid_key" ON "trading"."instruments"("conid");

-- CreateIndex
CREATE UNIQUE INDEX "instruments_occ_symbol_key" ON "trading"."instruments"("occ_symbol");

-- CreateIndex
CREATE INDEX "instruments_symbol_idx" ON "trading"."instruments"("symbol");

-- CreateIndex
CREATE INDEX "instruments_underlying_symbol_idx" ON "trading"."instruments"("underlying_symbol");

-- CreateIndex
CREATE INDEX "instruments_sec_type_expiry_idx" ON "trading"."instruments"("sec_type", "expiry");

-- CreateIndex
CREATE INDEX "executions_ibkr_account_id_trade_date_idx" ON "trading"."executions"("ibkr_account_id", "trade_date");

-- CreateIndex
CREATE INDEX "executions_ibkr_account_id_instrument_id_trade_time_idx" ON "trading"."executions"("ibkr_account_id", "instrument_id", "trade_time");

-- CreateIndex
CREATE INDEX "executions_round_trip_id_idx" ON "trading"."executions"("round_trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "executions_ibkr_account_id_dedupe_key_key" ON "trading"."executions"("ibkr_account_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "round_trips_ibkr_account_id_status_idx" ON "trading"."round_trips"("ibkr_account_id", "status");

-- CreateIndex
CREATE INDEX "round_trips_instrument_id_idx" ON "trading"."round_trips"("instrument_id");

-- CreateIndex
CREATE INDEX "round_trips_closed_at_idx" ON "trading"."round_trips"("closed_at");

-- CreateIndex
CREATE UNIQUE INDEX "round_trips_ibkr_account_id_open_execution_key_key" ON "trading"."round_trips"("ibkr_account_id", "open_execution_key");

-- CreateIndex
CREATE UNIQUE INDEX "positions_ibkr_account_id_instrument_id_key" ON "trading"."positions"("ibkr_account_id", "instrument_id");

-- CreateIndex
CREATE INDEX "position_snapshots_ibkr_account_id_date_idx" ON "trading"."position_snapshots"("ibkr_account_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "position_snapshots_ibkr_account_id_date_instrument_id_key" ON "trading"."position_snapshots"("ibkr_account_id", "date", "instrument_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_snapshots_ibkr_account_id_date_key" ON "trading"."account_snapshots"("ibkr_account_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "cash_balances_ibkr_account_id_date_currency_key" ON "trading"."cash_balances"("ibkr_account_id", "date", "currency");

-- CreateIndex
CREATE INDEX "cash_transactions_ibkr_account_id_date_time_idx" ON "trading"."cash_transactions"("ibkr_account_id", "date_time");

-- CreateIndex
CREATE UNIQUE INDEX "cash_transactions_ibkr_account_id_transaction_id_key" ON "trading"."cash_transactions"("ibkr_account_id", "transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "corporate_actions_ibkr_account_id_transaction_id_key" ON "trading"."corporate_actions"("ibkr_account_id", "transaction_id");

-- AddForeignKey
ALTER TABLE "app"."accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ibkr_accounts" ADD CONSTRAINT "ibkr_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."flex_queries" ADD CONSTRAINT "flex_queries_ibkr_account_id_fkey" FOREIGN KEY ("ibkr_account_id") REFERENCES "app"."ibkr_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."sync_runs" ADD CONSTRAINT "sync_runs_ibkr_account_id_fkey" FOREIGN KEY ("ibkr_account_id") REFERENCES "app"."ibkr_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."watchlists" ADD CONSTRAINT "watchlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."watchlist_items" ADD CONSTRAINT "watchlist_items_watchlist_id_fkey" FOREIGN KEY ("watchlist_id") REFERENCES "app"."watchlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."watchlist_items" ADD CONSTRAINT "watchlist_items_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "trading"."instruments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."alert_rules" ADD CONSTRAINT "alert_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."alert_rules" ADD CONSTRAINT "alert_rules_ibkr_account_id_fkey" FOREIGN KEY ("ibkr_account_id") REFERENCES "app"."ibkr_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."alert_rules" ADD CONSTRAINT "alert_rules_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "trading"."instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."alert_events" ADD CONSTRAINT "alert_events_alert_rule_id_fkey" FOREIGN KEY ("alert_rule_id") REFERENCES "app"."alert_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."notification_channels" ADD CONSTRAINT "notification_channels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trading"."executions" ADD CONSTRAINT "executions_ibkr_account_id_fkey" FOREIGN KEY ("ibkr_account_id") REFERENCES "app"."ibkr_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trading"."executions" ADD CONSTRAINT "executions_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "trading"."instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trading"."executions" ADD CONSTRAINT "executions_round_trip_id_fkey" FOREIGN KEY ("round_trip_id") REFERENCES "trading"."round_trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trading"."round_trips" ADD CONSTRAINT "round_trips_ibkr_account_id_fkey" FOREIGN KEY ("ibkr_account_id") REFERENCES "app"."ibkr_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trading"."round_trips" ADD CONSTRAINT "round_trips_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "trading"."instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trading"."positions" ADD CONSTRAINT "positions_ibkr_account_id_fkey" FOREIGN KEY ("ibkr_account_id") REFERENCES "app"."ibkr_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trading"."positions" ADD CONSTRAINT "positions_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "trading"."instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trading"."position_snapshots" ADD CONSTRAINT "position_snapshots_ibkr_account_id_fkey" FOREIGN KEY ("ibkr_account_id") REFERENCES "app"."ibkr_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trading"."position_snapshots" ADD CONSTRAINT "position_snapshots_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "trading"."instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trading"."account_snapshots" ADD CONSTRAINT "account_snapshots_ibkr_account_id_fkey" FOREIGN KEY ("ibkr_account_id") REFERENCES "app"."ibkr_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trading"."cash_balances" ADD CONSTRAINT "cash_balances_ibkr_account_id_fkey" FOREIGN KEY ("ibkr_account_id") REFERENCES "app"."ibkr_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trading"."cash_transactions" ADD CONSTRAINT "cash_transactions_ibkr_account_id_fkey" FOREIGN KEY ("ibkr_account_id") REFERENCES "app"."ibkr_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trading"."cash_transactions" ADD CONSTRAINT "cash_transactions_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "trading"."instruments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trading"."corporate_actions" ADD CONSTRAINT "corporate_actions_ibkr_account_id_fkey" FOREIGN KEY ("ibkr_account_id") REFERENCES "app"."ibkr_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trading"."corporate_actions" ADD CONSTRAINT "corporate_actions_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "trading"."instruments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
