-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "app"."AlertRuleType" ADD VALUE 'RSI_BELOW';
ALTER TYPE "app"."AlertRuleType" ADD VALUE 'RSI_ABOVE';
ALTER TYPE "app"."AlertRuleType" ADD VALUE 'SMA_CROSS_UP';
ALTER TYPE "app"."AlertRuleType" ADD VALUE 'SMA_CROSS_DOWN';
ALTER TYPE "app"."AlertRuleType" ADD VALUE 'BREAKOUT_HIGH';
ALTER TYPE "app"."AlertRuleType" ADD VALUE 'BREAKOUT_LOW';

-- AlterTable
ALTER TABLE "app"."alert_rules" ADD COLUMN     "indicator_params" JSONB;

