# MAC 12.5.0 — Security, Cost & Autonomous Scheduling Architecture

MAC is Schedule Intelligence's reasoning layer. The deterministic scheduling engine remains the source of schedule truth.

## Cost controls
- Per-request, daily and monthly budgets are checked before model execution.
- Unknown model pricing is blocked rather than guessed.
- MAC result caching remains available for repeated questions.
- Autonomous scheduling is disabled by default.
- Autonomous scheduling uses one structured project-planning model call per run and deterministic validation after the call.
- AI schedule runs are persisted with estimated/actual cost and change counts.

## Data handling
Interactive MAC questions use the minimized context policy.

Autonomous **schedule reasoning** intentionally uses a richer scheduling context because task semantics are required to infer sequencing. It includes task names and truncated descriptions, schedule fields, hierarchy references, dependency references and resource capacity/role data. It does not send connector credentials, raw connector payloads, external IDs, email addresses, phone numbers or URLs. Obvious email/phone/URL patterns in task text are redacted.

Task and resource references sent to the model are pseudonymous (`Task-001`, `Resource-001`). External IDs such as `E1293` and `A1260` are resolved inside SI and are not required in the model response.

## Autonomous safety gates
- `MAC_AUTONOMOUS_SCHEDULING=false` by default.
- Dependency application requires `MAC_AUTO_APPLY_DEPENDENCIES=true`.
- Expected-date optimization requires `MAC_AUTO_OPTIMIZE_DATES=true`.
- Resource reassignment requires `MAC_ALLOW_RESOURCE_REASSIGNMENT=true`.
- Actual dates are never modified by MAC.
- Task hierarchy/`parentId` is never modified by MAC.
- AI proposals must reference existing tasks/resources.
- Self-links and duplicate dependencies are rejected.
- Dependency cycles are rejected by the canonical CPM graph engine.
- If autonomous application fails, added dependencies and modified expected dates are rolled back.
- Every successful autonomous run creates a schedule snapshot.
- Rollback is limited to the latest applied run to avoid overwriting newer user work.

## Provider security
- Provider API keys remain server-side.
- No AI secret is exposed through `NEXT_PUBLIC_*` variables.
- Connector credentials remain encrypted server-side.
- PRMS actual dates remain source-owned.

## Scheduling principle
MAC proposes. The deterministic engine validates and computes. The database stores the resulting schedule. This prevents an LLM from becoming the authoritative scheduling calculator.
