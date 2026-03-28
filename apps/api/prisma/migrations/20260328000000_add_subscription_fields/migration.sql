-- AlterTable: add subscription and usage-counter columns to users
ALTER TABLE "users"
  ADD COLUMN "subscription_tier"        TEXT      NOT NULL DEFAULT 'FREE',
  ADD COLUMN "subscription_expires_at"  TIMESTAMP(3),
  ADD COLUMN "recordings_this_month"    INTEGER   NOT NULL DEFAULT 0,
  ADD COLUMN "recordings_month_reset_at" TIMESTAMP(3),
  ADD COLUMN "chat_messages_today"      INTEGER   NOT NULL DEFAULT 0,
  ADD COLUMN "chat_messages_day_reset_at" TIMESTAMP(3);
