-- Généralisation des comptes : ibkr_accounts → broker_accounts (MANUAL | IBKR)
-- Migration non destructive : renommages purs + colonne broker + token nullable.

-- Types
ALTER TYPE "app"."IbkrAccountStatus" RENAME TO "BrokerAccountStatus";
CREATE TYPE "app"."BrokerType" AS ENUM ('MANUAL', 'IBKR');
ALTER TYPE "trading"."ExecutionSource" ADD VALUE 'MANUAL';

-- Table comptes
ALTER TABLE "app"."ibkr_accounts" RENAME TO "broker_accounts";
ALTER TABLE "app"."broker_accounts" RENAME COLUMN "ibkr_account_id" TO "external_account_id";
ALTER TABLE "app"."broker_accounts" ADD COLUMN "broker" "app"."BrokerType" NOT NULL DEFAULT 'IBKR';
ALTER TABLE "app"."broker_accounts" ALTER COLUMN "flex_token_encrypted" DROP NOT NULL;

-- Colonnes FK des tables enfants
ALTER TABLE "app"."flex_queries" RENAME COLUMN "ibkr_account_id" TO "broker_account_id";
ALTER TABLE "app"."sync_runs" RENAME COLUMN "ibkr_account_id" TO "broker_account_id";
ALTER TABLE "app"."alert_rules" RENAME COLUMN "ibkr_account_id" TO "broker_account_id";
ALTER TABLE "flex_raw"."flex_statement_raw" RENAME COLUMN "ibkr_account_id" TO "broker_account_id";
ALTER TABLE "trading"."executions" RENAME COLUMN "ibkr_account_id" TO "broker_account_id";
ALTER TABLE "trading"."round_trips" RENAME COLUMN "ibkr_account_id" TO "broker_account_id";
ALTER TABLE "trading"."positions" RENAME COLUMN "ibkr_account_id" TO "broker_account_id";
ALTER TABLE "trading"."position_snapshots" RENAME COLUMN "ibkr_account_id" TO "broker_account_id";
ALTER TABLE "trading"."account_snapshots" RENAME COLUMN "ibkr_account_id" TO "broker_account_id";
ALTER TABLE "trading"."cash_balances" RENAME COLUMN "ibkr_account_id" TO "broker_account_id";
ALTER TABLE "trading"."cash_transactions" RENAME COLUMN "ibkr_account_id" TO "broker_account_id";
ALTER TABLE "trading"."corporate_actions" RENAME COLUMN "ibkr_account_id" TO "broker_account_id";

-- Index (renommer l'index d'une contrainte pkey/unique renomme aussi la contrainte)
ALTER INDEX "app"."ibkr_accounts_pkey" RENAME TO "broker_accounts_pkey";
ALTER INDEX "app"."ibkr_accounts_ibkr_account_id_key" RENAME TO "broker_accounts_external_account_id_key";
ALTER INDEX "app"."ibkr_accounts_user_id_idx" RENAME TO "broker_accounts_user_id_idx";
ALTER INDEX "app"."flex_queries_ibkr_account_id_query_id_key" RENAME TO "flex_queries_broker_account_id_query_id_key";
ALTER INDEX "app"."sync_runs_ibkr_account_id_kind_started_at_idx" RENAME TO "sync_runs_broker_account_id_kind_started_at_idx";
ALTER INDEX "flex_raw"."flex_statement_raw_ibkr_account_id_fetched_at_idx" RENAME TO "flex_statement_raw_broker_account_id_fetched_at_idx";
ALTER INDEX "trading"."executions_ibkr_account_id_dedupe_key_key" RENAME TO "executions_broker_account_id_dedupe_key_key";
ALTER INDEX "trading"."executions_ibkr_account_id_trade_date_idx" RENAME TO "executions_broker_account_id_trade_date_idx";
ALTER INDEX "trading"."executions_ibkr_account_id_instrument_id_trade_time_idx" RENAME TO "executions_broker_account_id_instrument_id_trade_time_idx";
ALTER INDEX "trading"."round_trips_ibkr_account_id_open_execution_key_key" RENAME TO "round_trips_broker_account_id_open_execution_key_key";
ALTER INDEX "trading"."round_trips_ibkr_account_id_status_idx" RENAME TO "round_trips_broker_account_id_status_idx";
ALTER INDEX "trading"."positions_ibkr_account_id_instrument_id_key" RENAME TO "positions_broker_account_id_instrument_id_key";
ALTER INDEX "trading"."position_snapshots_ibkr_account_id_date_instrument_id_key" RENAME TO "position_snapshots_broker_account_id_date_instrument_id_key";
ALTER INDEX "trading"."position_snapshots_ibkr_account_id_date_idx" RENAME TO "position_snapshots_broker_account_id_date_idx";
ALTER INDEX "trading"."account_snapshots_ibkr_account_id_date_key" RENAME TO "account_snapshots_broker_account_id_date_key";
ALTER INDEX "trading"."cash_balances_ibkr_account_id_date_currency_key" RENAME TO "cash_balances_broker_account_id_date_currency_key";
ALTER INDEX "trading"."cash_transactions_ibkr_account_id_transaction_id_key" RENAME TO "cash_transactions_broker_account_id_transaction_id_key";
ALTER INDEX "trading"."cash_transactions_ibkr_account_id_date_time_idx" RENAME TO "cash_transactions_broker_account_id_date_time_idx";
ALTER INDEX "trading"."corporate_actions_ibkr_account_id_transaction_id_key" RENAME TO "corporate_actions_broker_account_id_transaction_id_key";

-- Contraintes FK
ALTER TABLE "app"."broker_accounts" RENAME CONSTRAINT "ibkr_accounts_user_id_fkey" TO "broker_accounts_user_id_fkey";
ALTER TABLE "app"."flex_queries" RENAME CONSTRAINT "flex_queries_ibkr_account_id_fkey" TO "flex_queries_broker_account_id_fkey";
ALTER TABLE "app"."sync_runs" RENAME CONSTRAINT "sync_runs_ibkr_account_id_fkey" TO "sync_runs_broker_account_id_fkey";
ALTER TABLE "app"."alert_rules" RENAME CONSTRAINT "alert_rules_ibkr_account_id_fkey" TO "alert_rules_broker_account_id_fkey";
ALTER TABLE "trading"."executions" RENAME CONSTRAINT "executions_ibkr_account_id_fkey" TO "executions_broker_account_id_fkey";
ALTER TABLE "trading"."round_trips" RENAME CONSTRAINT "round_trips_ibkr_account_id_fkey" TO "round_trips_broker_account_id_fkey";
ALTER TABLE "trading"."positions" RENAME CONSTRAINT "positions_ibkr_account_id_fkey" TO "positions_broker_account_id_fkey";
ALTER TABLE "trading"."position_snapshots" RENAME CONSTRAINT "position_snapshots_ibkr_account_id_fkey" TO "position_snapshots_broker_account_id_fkey";
ALTER TABLE "trading"."account_snapshots" RENAME CONSTRAINT "account_snapshots_ibkr_account_id_fkey" TO "account_snapshots_broker_account_id_fkey";
ALTER TABLE "trading"."cash_balances" RENAME CONSTRAINT "cash_balances_ibkr_account_id_fkey" TO "cash_balances_broker_account_id_fkey";
ALTER TABLE "trading"."cash_transactions" RENAME CONSTRAINT "cash_transactions_ibkr_account_id_fkey" TO "cash_transactions_broker_account_id_fkey";
ALTER TABLE "trading"."corporate_actions" RENAME CONSTRAINT "corporate_actions_ibkr_account_id_fkey" TO "corporate_actions_broker_account_id_fkey";
