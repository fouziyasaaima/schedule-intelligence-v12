# Schedule Intelligence 20.3.0 — Integration Hub

## Backward-compatible connector enhancement

This release extends the existing v20.2.0 connector implementation without removing or renaming existing connector APIs, mappings, identities, OAuth flows, Google Sheets, Microsoft 365, PRMS integration, or scheduled synchronization.

### Added

- Additive `ConnectorSyncCursor` state for incremental `updatedSince` synchronization.
- Additive `ConnectorEvent` queue for inbound webhook deliveries.
- Idempotent webhook ingestion using `X-Idempotency-Key` / `X-Webhook-Id` or a deterministic payload hash.
- Background event processing with exponential retry and dead-letter state.
- Connector health endpoint exposing pending events, dead letters, conflicts and last run.
- Connector event history endpoint.
- Connector conflict storage and resolution endpoint.
- Webhook deliveries can trigger the existing canonical connector mapping/synchronization engine rather than performing blind writes.
- Incremental synchronization is opt-in through connector configuration. Existing connectors remain unchanged unless `sync.incremental` is enabled.
- UI Integration Hub visibility for queued events, dead letters and conflicts.

### New connector sync configuration

```json
{
  "sync": {
    "incremental": true,
    "updatedSinceParam": "updatedSince",
    "intervalMinutes": 30,
    "maxAttempts": 5,
    "retryBackoffSeconds": 30,
    "webhookTrigger": true
  }
}
```

### Compatibility

Existing `/v1/connectors/*` and `/api/v1/connectors/*` routes remain available. Existing connectors do not require migration of their configuration. The new Prisma migration is additive and only creates the Integration Hub support tables.

### Important operational note

Webhook payloads are retained for audit/idempotency, but arbitrary webhook fields are not blindly written into Schedule Intelligence. Webhook processing invokes the existing connector synchronization/mapping engine, preserving the existing data-contract boundary.
