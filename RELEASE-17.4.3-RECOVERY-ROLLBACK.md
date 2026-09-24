# Schedule Intelligence v17.4.3 — Recovery / Rollback Hardening

## Purpose
This release addresses the project-specific loading lock-up observed after an invalid or problematic date edit.

## Changes
- The known `SI-Quick-Start-Schedule` project is no longer selected as the automatic landing project when another project exists.
- Added a guarded **Delete project** action in the schedule toolbar.
- Task date edits are now performed inside an atomic Prisma transaction.
- Parent/child date propagation and CPM recomputation occur inside the same transaction.
- If validation, propagation, recomputation, persistence, or the transaction timeout fails, the entire edit is rolled back.
- The API returns HTTP 409 with `rolledBack: true` for rejected schedule edits.
- Frontend immediately restores the previous task state and shows a clear rollback message.
- Connector/PRMS write-back begins only after the local transaction has successfully committed.
- Interactive schedule edits have a 30-second transaction timeout to prevent an indefinitely hanging request.

## Important
Do not delete PostgreSQL volumes during deployment. Existing project data must be preserved.

## Deployment
```powershell
docker compose down
docker compose build --no-cache
docker compose up -d
docker compose ps
```
