-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "app"."AlertRuleType" ADD VALUE 'IV_ABOVE';
ALTER TYPE "app"."AlertRuleType" ADD VALUE 'IV_BELOW';
ALTER TYPE "app"."AlertRuleType" ADD VALUE 'PUT_CALL_ABOVE';
ALTER TYPE "app"."AlertRuleType" ADD VALUE 'GAMMA_FLIP_NEAR';

