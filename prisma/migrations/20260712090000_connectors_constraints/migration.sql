-- DropIndex
DROP INDEX "app"."broker_accounts_external_account_id_key";

-- DropIndex
DROP INDEX "trading"."instruments_occ_symbol_key";

-- CreateIndex
CREATE UNIQUE INDEX "broker_accounts_user_id_external_account_id_key" ON "app"."broker_accounts"("user_id", "external_account_id");

-- CreateIndex
CREATE INDEX "instruments_occ_symbol_idx" ON "trading"."instruments"("occ_symbol");

