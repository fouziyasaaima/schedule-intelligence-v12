# Schedule Intelligence 19.0.0 — Hybrid Autonomous Scheduling

## Major release
- Deterministic SI scheduling remains fully functional when MAC is unavailable.
- MAC is treated as an intelligence/action layer, not a core scheduling dependency.
- Contextual MAC is exposed throughout Schedule, Network, Resources, Pulse, Forecast, Impact, Intelligence and Connectors.
- One-sheet General Schedule Excel export added for normal users; Advanced SISF remains available separately.
- General Schedule template is Start + Duration first; End is calculated/preserved by SI.
- UI/API/Docker release version unified at 19.0.0.
- API health/readiness endpoints now report the release version from APP_VERSION.
- Existing transactional task-date rollback behavior is retained: invalid propagation/recompute rejects the change and rolls back the transaction.
- Large-data MAC materiality mode remains authoritative on the deterministic schedule graph and reasons over decision-sized slices.
- PRMS export remains independent of MAC and continues to require explicit destination Project ID.

## Reliability principle
MAC failure, token exhaustion or provider unavailability must never prevent core import, schedule, validation, resource, network or export operations.
