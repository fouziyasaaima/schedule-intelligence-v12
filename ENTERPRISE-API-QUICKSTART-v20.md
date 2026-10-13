# SI v20 Enterprise API Quick Start

## Preferred base

```text
http://localhost:4010/api/v1
```

The legacy `/v1` namespace remains available.

## Authentication

```http
Authorization: Bearer YOUR_API_KEY
```

Use the smallest scopes required by the integration.

## Typical scheduling workflow

```text
1. GET    /projects/{projectId}
2. GET    /projects/{projectId}/tasks
3. POST   /projects/{projectId}/schedule/analyze
4. POST   /projects/{projectId}/schedule/proposals
5. POST   /schedule/proposals/{proposalId}/approve
6. POST   /schedule/proposals/{proposalId}/publish
```

The analyze endpoint is deterministic and read-only. Proposal creation does not mutate live task dates. Publish is transactional; if validation or recompute fails, the transaction is rolled back.

## Why proposals exist

External systems and MAC should not directly write arbitrary task dates. A proposal creates a reviewable change set. This provides a clean approval boundary for PRMS, MES and future ERP integrations.

## OpenAPI

```text
GET /openapi.json
```

The document includes the preferred `/api/v1` contract and the legacy `/v1` compatibility paths.
