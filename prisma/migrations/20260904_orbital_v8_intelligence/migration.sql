CREATE TABLE "scenarios" ("id" TEXT NOT NULL, "project_id" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT, "status" TEXT NOT NULL DEFAULT 'DRAFT', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "scenarios_pkey" PRIMARY KEY ("id"));
CREATE TABLE "scenario_changes" ("id" TEXT NOT NULL, "scenario_id" TEXT NOT NULL, "task_id" TEXT NOT NULL, "expected_start" TIMESTAMP(3), "expected_end" TIMESTAMP(3), "duration_days" INTEGER, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "scenario_changes_pkey" PRIMARY KEY ("id"));
CREATE TABLE "forecast_runs" ("id" TEXT NOT NULL, "project_id" TEXT NOT NULL, "iterations" INTEGER NOT NULL, "uncertainty_pct" DOUBLE PRECISION NOT NULL, "result" JSONB NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "forecast_runs_pkey" PRIMARY KEY ("id"));
CREATE INDEX "scenarios_project_id_idx" ON "scenarios"("project_id");
CREATE INDEX "scenario_changes_scenario_id_idx" ON "scenario_changes"("scenario_id");
CREATE INDEX "forecast_runs_project_id_created_at_idx" ON "forecast_runs"("project_id","created_at");
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scenario_changes" ADD CONSTRAINT "scenario_changes_scenario_id_fkey" FOREIGN KEY ("scenario_id") REFERENCES "scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
