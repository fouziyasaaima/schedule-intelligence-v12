# Schedule Intelligence 14.1.3 — Complete UX & MAC Context Release

## Included
- MAC answer is rendered directly above the Ask MAC input.
- MAC resource evidence is project-scoped: only resources assigned to the selected project are supplied to MAC.
- MAC receives authoritative resource names for human-readable reasoning.
- Human-readable MAC answers, summaries, priorities, risks and actions resolve internal `Resource-*` references to resource names before display.
- Internal resource IDs and connector IDs remain hidden from MAC user-facing responses.
- Schedule planner resource context includes resource names while retaining stable resource references for validated execution.
- Added visible application version `v14.1.3` in the Gantt top bar and expanded navigation rail, Dify-style.
- Added `NEXT_PUBLIC_APP_VERSION` build configuration with a 14.1.3 default.
- Existing standard external Docker volume `pg_data` remains unchanged.

## Security / correctness
- Project and organization scoping remains enforced server-side.
- Resource proposal execution continues to use internal resource IDs only after server-side validation.
- No actual/source-owned dates are modified by MAC.
- No schema migration is required for this release.

## Build
```powershell
docker compose down
docker compose build --no-cache
docker compose up -d
```

Do not use `docker compose down -v`.
