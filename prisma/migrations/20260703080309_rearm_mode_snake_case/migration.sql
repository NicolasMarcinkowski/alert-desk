/*
  Warnings:

  - You are about to drop the column `rearmMode` on the `alert_rules` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "app"."alert_rules" DROP COLUMN "rearmMode",
ADD COLUMN     "rearm_mode" "app"."RearmMode" NOT NULL DEFAULT 'AUTO_ON_RECROSS';
