-- Schedule Intelligence 20.3.0 — additive Integration Hub foundation.
-- Existing connector tables are intentionally untouched.

CREATE TABLE "connector_sync_cursors" (
  "id" TEXT NOT NULL,
  "connector_id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "cursor" TEXT,
  "last_external_sync_at" TIMESTAMP(3),
  "last_successful_sync_at" TIMESTAMP(3),
  "state" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "connector_sync_cursors_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "connector_sync_cursors_connector_id_entity_type_key" ON "connector_sync_cursors"("connector_id", "entity_type");
CREATE INDEX "connector_sync_cursors_connector_id_last_successful_sync_at_idx" ON "connector_sync_cursors"("connector_id", "last_successful_sync_at");
ALTER TABLE "connector_sync_cursors" ADD CONSTRAINT "connector_sync_cursors_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "connector_events" (
  "id" TEXT NOT NULL,
  "connector_id" TEXT NOT NULL,
  "event_type" TEXT,
  "entity_type" TEXT,
  "external_id" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "correlation_id" TEXT,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMP(3),
  "locked_by" TEXT,
  "processed_at" TIMESTAMP(3),
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "connector_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "connector_events_idempotency_key_key" ON "connector_events"("idempotency_key");
CREATE INDEX "connector_events_connector_id_status_available_at_idx" ON "connector_events"("connector_id", "status", "available_at");
CREATE INDEX "connector_events_connector_id_created_at_idx" ON "connector_events"("connector_id", "created_at");
ALTER TABLE "connector_events" ADD CONSTRAINT "connector_events_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "connector_conflicts" (
  "id" TEXT NOT NULL,
  "connector_id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "internal_id" TEXT NOT NULL,
  "external_id" TEXT NOT NULL,
  "strategy" TEXT NOT NULL,
  "internal_value" JSONB NOT NULL,
  "external_value" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "resolution" TEXT,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "connector_conflicts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "connector_conflicts_connector_id_status_created_at_idx" ON "connector_conflicts"("connector_id", "status", "created_at");
CREATE INDEX "connector_conflicts_connector_id_entity_type_external_id_idx" ON "connector_conflicts"("connector_id", "entity_type", "external_id");
ALTER TABLE "connector_conflicts" ADD CONSTRAINT "connector_conflicts_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
