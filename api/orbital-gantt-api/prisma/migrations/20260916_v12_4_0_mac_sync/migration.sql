CREATE TABLE "mac_settings" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "provider" TEXT NOT NULL DEFAULT 'gemini',
  "model" TEXT NOT NULL DEFAULT 'gemini-3.5-flash-lite',
  "daily_budget_usd" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "monthly_budget_usd" DOUBLE PRECISION NOT NULL DEFAULT 10,
  "max_request_cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
  "max_tokens_per_request" INTEGER NOT NULL DEFAULT 12000,
  "require_confirmation_above_usd" DOUBLE PRECISION NOT NULL DEFAULT 0.02,
  "cache_enabled" BOOLEAN NOT NULL DEFAULT true,
  "data_policy" TEXT NOT NULL DEFAULT 'MINIMAL',
  "autonomous_watch" BOOLEAN NOT NULL DEFAULT false,
  "watch_interval_minutes" INTEGER NOT NULL DEFAULT 60,
  "notify_email" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mac_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mac_settings_organization_id_key" ON "mac_settings"("organization_id");
ALTER TABLE "mac_settings" ADD CONSTRAINT "mac_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "mac_usage" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT,
  "settings_id" TEXT,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "request_kind" TEXT NOT NULL,
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "estimated_cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "actual_cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cache_hit" BOOLEAN NOT NULL DEFAULT false,
  "context_hash" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mac_usage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mac_usage_organization_id_created_at_idx" ON "mac_usage"("organization_id", "created_at");
CREATE INDEX "mac_usage_organization_id_project_id_created_at_idx" ON "mac_usage"("organization_id", "project_id", "created_at");
ALTER TABLE "mac_usage" ADD CONSTRAINT "mac_usage_settings_id_fkey" FOREIGN KEY ("settings_id") REFERENCES "mac_settings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
