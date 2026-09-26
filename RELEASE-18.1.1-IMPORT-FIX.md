# Schedule Intelligence v18.1.1 — Simple Import Fix

## Import fix
Fixed the P2002 `connectorIdentity` failure when importing the one-sheet General Schedule template.

### Root cause
The simplified Excel importer was generating synthetic connector identities for native SI resources. The database has both of these unique constraints:

- `(connector_id, entity_type, external_id)`
- `(connector_id, entity_type, internal_id)`

A resource reused across tasks/projects could therefore receive a second identity with the same internal resource ID and fail with P2002.

### Correct behavior
- Native resources from the simple template do **not** require connector identities.
- Real external resource IDs can still be mapped safely.
- Existing connector identities are reconciled by external/internal identity before creating a new row.
- Numeric task IDs such as `1`, `2`, `3` are treated as local row IDs and are not written to the organization-wide SISF identity table.
- Task IDs remain available for dependencies and parent relationships within the import.
- Re-importing the same schedule is safer and avoids the identity collision that previously blocked the transaction.

## Template
The Quick-start General Schedule export now contains **one sheet only: `Schedule`**.

Users only need:
- Task Name
- Start
- Duration
- optional Parent
- optional Predecessor
- optional Resource
- optional Owner
- optional Priority/Status/% Complete/Notes

End is calculated from Start + Duration.

## Rollback
The resource/task/dependency import remains inside the Prisma transaction, so a failed import rolls back the schedule changes made by that import transaction.

## Important
The API Dockerfile builds from `src`, so the patched TypeScript source is the authoritative runtime source. Dependencies are intentionally not bundled into this source package.
