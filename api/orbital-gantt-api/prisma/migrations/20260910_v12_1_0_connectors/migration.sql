CREATE TYPE "ConnectorAuthType" AS ENUM ('NONE','API_KEY','BEARER','BASIC','OAUTH2_AUTHORIZATION_CODE','OAUTH2_CLIENT_CREDENTIALS','CUSTOM_HEADERS');
CREATE TYPE "ConnectorStatus" AS ENUM ('DRAFT','CONNECTED','ERROR','DISABLED');
CREATE TYPE "ConnectorSyncDirection" AS ENUM ('IMPORT','EXPORT','BIDIRECTIONAL');

CREATE TABLE "connectors" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'generic-rest',
  "base_url" TEXT NOT NULL,
  "auth_type" "ConnectorAuthType" NOT NULL DEFAULT 'NONE',
  "status" "ConnectorStatus" NOT NULL DEFAULT 'DRAFT',
  "direction" "ConnectorSyncDirection" NOT NULL DEFAULT 'IMPORT',
  "config" JSONB NOT NULL DEFAULT '{}',
  "secret_ciphertext" TEXT,
  "last_tested_at" TIMESTAMP(3),
  "last_sync_at" TIMESTAMP(3),
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "connectors_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "connectors_organization_id_status_idx" ON "connectors"("organization_id","status");
ALTER TABLE "connectors" ADD CONSTRAINT "connectors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "connector_mappings" (
  "id" TEXT NOT NULL,
  "connector_id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "external_field" TEXT NOT NULL,
  "internal_field" TEXT NOT NULL,
  "direction" TEXT NOT NULL DEFAULT 'IMPORT',
  "transform" JSONB NOT NULL DEFAULT '{}',
  "required" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "connector_mappings_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "connector_mappings_connector_id_entity_type_idx" ON "connector_mappings"("connector_id","entity_type");
ALTER TABLE "connector_mappings" ADD CONSTRAINT "connector_mappings_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "connector_identities" (
  "id" TEXT NOT NULL,
  "connector_id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "internal_id" TEXT NOT NULL,
  "external_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "connector_identities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "connector_identities_connector_id_entity_type_external_id_key" ON "connector_identities"("connector_id","entity_type","external_id");
CREATE UNIQUE INDEX "connector_identities_connector_id_entity_type_internal_id_key" ON "connector_identities"("connector_id","entity_type","internal_id");
CREATE INDEX "connector_identities_connector_id_entity_type_idx" ON "connector_identities"("connector_id","entity_type");
ALTER TABLE "connector_identities" ADD CONSTRAINT "connector_identities_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "connector_sync_runs" (
  "id" TEXT NOT NULL,
  "connector_id" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "records_read" INTEGER NOT NULL DEFAULT 0,
  "records_created" INTEGER NOT NULL DEFAULT 0,
  "records_updated" INTEGER NOT NULL DEFAULT 0,
  "records_failed" INTEGER NOT NULL DEFAULT 0,
  "details" JSONB NOT NULL DEFAULT '{}',
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "error" TEXT,
  CONSTRAINT "connector_sync_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "connector_sync_runs_connector_id_started_at_idx" ON "connector_sync_runs"("connector_id","started_at");
ALTER TABLE "connector_sync_runs" ADD CONSTRAINT "connector_sync_runs_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "connector_webhooks" (
  "id" TEXT NOT NULL,
  "connector_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "secret_hash" TEXT,
  "event_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_received_at" TIMESTAMP(3),
  CONSTRAINT "connector_webhooks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "connector_webhooks_token_hash_key" ON "connector_webhooks"("token_hash");
CREATE INDEX "connector_webhooks_connector_id_enabled_idx" ON "connector_webhooks"("connector_id","enabled");
ALTER TABLE "connector_webhooks" ADD CONSTRAINT "connector_webhooks_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "connector_oauth_states" (
  "id" TEXT NOT NULL,
  "connector_id" TEXT NOT NULL,
  "state_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "connector_oauth_states_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "connector_oauth_states_state_hash_key" ON "connector_oauth_states"("state_hash");
CREATE INDEX "connector_oauth_states_connector_id_expires_at_idx" ON "connector_oauth_states"("connector_id","expires_at");
ALTER TABLE "connector_oauth_states" ADD CONSTRAINT "connector_oauth_states_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "connectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
