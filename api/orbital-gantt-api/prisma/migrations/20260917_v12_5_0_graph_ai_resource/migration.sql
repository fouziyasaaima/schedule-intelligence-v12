ALTER TABLE "mac_settings" ADD COLUMN IF NOT EXISTS "autonomous_scheduling" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mac_settings" ADD COLUMN IF NOT EXISTS "auto_apply_dependencies" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mac_settings" ADD COLUMN IF NOT EXISTS "auto_optimize_dates" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mac_settings" ADD COLUMN IF NOT EXISTS "allow_resource_reassignment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "role" TEXT;
CREATE TABLE IF NOT EXISTS "ai_schedule_runs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "provider" TEXT,
  "model" TEXT,
  "task_count" INTEGER NOT NULL DEFAULT 0,
  "dependency_proposals" INTEGER NOT NULL DEFAULT 0,
  "dependencies_applied" INTEGER NOT NULL DEFAULT 0,
  "dates_proposed" INTEGER NOT NULL DEFAULT 0,
  "dates_applied" INTEGER NOT NULL DEFAULT 0,
  "resource_proposals" INTEGER NOT NULL DEFAULT 0,
  "resource_assignments_applied" INTEGER NOT NULL DEFAULT 0,
  "estimated_cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "actual_cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "summary" TEXT,
  "changes" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "error" TEXT,
  CONSTRAINT "ai_schedule_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ai_schedule_runs_organization_id_project_id_created_at_idx" ON "ai_schedule_runs"("organization_id", "project_id", "created_at");
DO $$ BEGIN
  ALTER TABLE "ai_schedule_runs" ADD CONSTRAINT "ai_schedule_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ai_schedule_runs" ADD CONSTRAINT "ai_schedule_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
