# Schedule Intelligence 17.4.2 — Functional Scheduling Hardening

## Fixed
- The primary Gantt no longer waits for resource leveling or dependency intelligence before rendering tasks.
- Dependency and resource intelligence now load progressively in the background.
- Task date edits refresh the schedule immediately; dependency refresh is non-blocking.
- Parent-date propagation uses a Set for descendant tracking instead of repeated linear scans.
- Schedule recomputation avoids an O(n²) task lookup when persisting results.
- Summary-date aggregation avoids large `Math.min(...array)` / `Math.max(...array)` argument lists.
- CPM cycle detection no longer uses `order.includes()` for every task.
- CPM project-end calculation avoids spreading a large task array.
- Connector/PRMS write-back no longer blocks a schedule edit. The local SI schedule is returned immediately and connector updates continue in the background.
- Version metadata and Docker defaults are aligned to 17.4.2.

## Expected behavior
Changing a parent task date should keep the Gantt usable even when the project contains many tasks/resources or the PRMS connector is slow. A connector failure must not roll back a valid local schedule edit.

## Deployment
Do not delete the existing PostgreSQL volume.

```powershell
docker compose down
docker compose build --no-cache
docker compose up -d
docker compose ps
```

Then open `http://localhost:3010`.
