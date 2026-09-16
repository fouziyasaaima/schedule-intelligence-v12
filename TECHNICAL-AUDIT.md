# Schedule Intelligence v11.2.2 — Technical Audit

## Reference review

The dependency model follows the four standard project-link types used by mature scheduling tools: Finish-to-Start, Start-to-Start, Finish-to-Finish and Start-to-Finish. The product keeps Finish-to-Start as the simplified default while exposing type and lag in the designer.

The developer portal follows patterns used by Stripe/Dify-style API documentation: resource-oriented paths, explicit authentication, endpoint-level descriptions, request/response examples, copyable cURL, and language-specific examples.

## Key problems found

1. Gantt dependency paths existed but were not a first-class interaction. Users could create links only through a modal and dependency lines were easy to miss.
2. The network was visual but not editable; nodes could not be repositioned or linked directly.
3. Recompute returned raw results but the UI did not explain what changed.
4. Monte Carlo maintained a second graph implementation and its old risk attribution was duration-share based rather than simulation-derived.
5. Resource timeline bars were decorative rather than using real assignment windows.
6. Resource workspace/header sizing could clip controls and did not consistently consume the complete stage viewport.
7. API documentation was a compact endpoint list rather than an enterprise developer portal.
8. API key management existed in the backend but was not exposed as a practical organization workflow in the developer portal.

## v11.1 changes

### Scheduling engine
- One canonical dependency graph analysis is shared by CPM, validation and Monte Carlo.
- Cycle errors include a concrete cycle path when available.
- Dependency creation is validated before the edge is allowed to persist.
- Recompute reports changed task start/finish shifts.
- Dependency changes immediately recompute downstream auto-scheduled tasks.
- Manually pinned tasks remain explicit anchors rather than being silently moved.

### Gantt interaction
- Drag from the right dependency port of a task bar to another task to create Finish-to-Start.
- Drop can target the task bar, not only a tiny target control.
- Dependency arrows are directional and animated for critical links.
- Relationship/lag information is available on edge hover.
- Zoom and Today controls were added.
- Full stage viewport is respected; task/timeline areas no longer create uncontrolled page overflow.

### Network
- Nodes can be dragged.
- Nodes can be connected by dragging a connector.
- Edges can be selected and removed.
- Critical edges animate.
- Network and Gantt consume the same dependency collection.

### Resources
- Resource screen is a full-height flex workspace.
- Header/actions wrap safely.
- Timeline mode uses actual assignment start/end windows and allocation percentages.
- Orbit remains visual and animated while the underlying workload is API-derived.

### Monte Carlo
- Uses the canonical graph order.
- Supports 500–50,000 simulations at the API boundary.
- P50/P80/P90/P95 and target confidence remain persisted.
- Risk drivers now expose simulation-derived finish correlation and sampled criticality.
- Cycle errors expose the affected path so the user can inspect the network.

### Developer API portal
- Endpoint navigation/search.
- Method/path/scope presentation.
- Request parameter chips.
- Example response payloads.
- Copyable cURL, Python, C# and JavaScript examples.
- OpenAPI link.
- Security guidance.
- Organization API key creation, scope selection and revocation for owner/admin users.
- Keys are only revealed at creation and are not retrievable later.

## Validation performed in this environment

- 50 TypeScript/TSX source files passed TypeScript transpilation/syntax diagnostics.
- package.json files parse successfully.
- ZIP packaging should be performed after the final audit.
- Docker Engine is not available in this environment, so a real Docker image build cannot be truthfully claimed here. The provided Dockerfiles use Node 20 Bookworm and Prisma 5.20.0 to keep the Linux deployment path deterministic.

## Production architecture

Browser session:

`Browser → same-origin /api proxy → API → PostgreSQL`

External integration:

`External app → HTTPS Bearer API key → API → organization-scoped resources`

Local:

`Docker Desktop → UI + API + PostgreSQL + Mailpit`

DigitalOcean:

`HTTPS reverse proxy → UI/API containers → PostgreSQL`, with real SMTP and `DEV_SEED=false`.
