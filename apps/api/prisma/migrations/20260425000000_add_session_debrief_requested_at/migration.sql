-- AlterTable: track when the client signalled the recording is finished, so the
-- worker can fire the session debrief once every chunk has finished processing.
ALTER TABLE "sessions"
  ADD COLUMN "debrief_requested_at" TIMESTAMP(3);
