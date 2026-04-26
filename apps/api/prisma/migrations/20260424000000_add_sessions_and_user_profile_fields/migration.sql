-- AlterTable
ALTER TABLE "users"
  ADD COLUMN "consent_accepted_at" TIMESTAMP(3),
  ADD COLUMN "consent_revoked_at" TIMESTAMP(3),
  ADD COLUMN "push_token" TEXT;

-- CreateTable
CREATE TABLE "sessions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "debrief_markdown" TEXT,
  "debrief_sections" JSONB DEFAULT '[]',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable
ALTER TABLE "recordings"
  ADD COLUMN "session_id" TEXT,
  ADD COLUMN "chunk_index" INTEGER;

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
CREATE INDEX "sessions_status_idx" ON "sessions"("status");
CREATE INDEX "recordings_session_id_idx" ON "recordings"("session_id");

-- AddForeignKey
ALTER TABLE "recordings"
  ADD CONSTRAINT "recordings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
