-- AlterTable: track total transcribed audio minutes per month per user. This
-- is the cost-bound counter — every chunk adds its transcribed duration here,
-- and the tier limits cap monthly minutes so one user can't run up unbounded
-- Whisper costs.
ALTER TABLE "users"
  ADD COLUMN "audio_minutes_this_month"      INTEGER   NOT NULL DEFAULT 0,
  ADD COLUMN "audio_minutes_month_reset_at"  TIMESTAMP(3);
