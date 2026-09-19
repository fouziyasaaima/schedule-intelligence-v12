# Schedule Intelligence v13.0.0 — BEYOND

## Major release

### MAC intent-driven scheduling
- Scheduling commands accept a user requirement in natural language.
- MAC analyses the complete supplied project graph before proposing changes.
- The deterministic schedule engine remains the source of truth.
- User intent is minimized/redacted before it reaches the provider.

### Safe change sets
- Recommendations are persisted as a change set.
- Recommended plans can be explicitly applied.
- Applied plans create a snapshot and remain rollback-capable.
- Task, dependency and resource references are validated against the selected project.

### PRMS project graph
- Events and Actions are merged.
- `E_ID_Dependance` / `E_Id` become hierarchical `parentId`.
- Hierarchy is explicitly kept separate from scheduling predecessors.
- Event resource mapping: `E_Leader` → resource ID and `Initial_Member` → resource name.
- Action resource mapping: `ID_Member` → resource ID and `AssignedTo` → resource name.

### Cost and security
- MAC remains disabled from making AI calls unless explicitly invoked or an enabled watch requires it.
- Request, daily and monthly budget gates remain enforced.
- Provider secrets stay server-side.
- Actual PRMS dates are not AI-writable.

### Docker
- PostgreSQL continues using the stable external volume key `pg_data`.
- No version is embedded in the PostgreSQL volume name.

## Validation
Run `docker compose build` and `docker compose up -d`. The API TypeScript build and Next.js UI build must both complete before release.
