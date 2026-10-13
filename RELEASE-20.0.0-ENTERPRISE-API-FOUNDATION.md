# Schedule Intelligence v20.0.0 — Enterprise API Foundation

## Purpose

v20 establishes the enterprise integration foundation on top of the v19.2 scheduling engine. The existing `/v1` API remains available for compatibility; new integrations should use `/api/v1`.

## Added

- Preferred `/api/v1` namespace for Projects, Tasks, Dependencies, Resources, Scheduling, Scenarios, Intelligence, Connectors, Imports and AI/MAC routes.
- Deterministic `POST /api/v1/projects/{id}/schedule/analyze` endpoint. It is read-only and does not require MAC.
- Schedule proposal workflow:
  - `POST /api/v1/projects/{id}/schedule/proposals`
  - `GET /api/v1/projects/{id}/schedule/proposals`
  - `POST /api/v1/schedule/proposals/{proposalId}/approve`
  - `POST /api/v1/schedule/proposals/{proposalId}/publish`
- Transactional publish: task changes and the scheduling recompute execute in one database transaction. Validation/recompute failure prevents a partial schedule update.
- OpenAPI contract updated to v20 and includes the preferred enterprise namespace while retaining legacy paths.
- Developer API documentation includes the proposal lifecycle and deterministic analysis endpoint.

## Architecture principle

MAC is an optional intelligence layer. The SI Core scheduling engine, validation, proposals, publishing, import/export and connectors continue to work without an AI provider.

## Compatibility

- Existing `/v1/*` routes remain available.
- Existing Prisma models are reused; schedule proposals are represented by the existing Scenario model with explicit lifecycle states (`PROPOSED`, `APPROVED`, `PUBLISHED`, `REJECTED`).
- No new database migration is required for this foundation release.

## Recommended integration sequence

1. Authenticate with an organization API key.
2. Read the project through `/api/v1/projects/{id}`.
3. Analyze with `/schedule/analyze`.
4. Create a proposal rather than mutating live dates directly when an external system wants a controlled change.
5. Approve the proposal.
6. Publish the proposal.
7. Use connectors/webhooks for synchronization with PRMS, MES or other systems.
