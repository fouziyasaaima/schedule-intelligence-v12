# Schedule Intelligence 12.4.0 — MAC + PRMS Gantt Bridge

## MAC
- Renamed the AI experience to **MAC — Schedule Intelligence's reasoning engine**.
- Added MAC Studio for provider/model selection, cost policy and privacy policy.
- Default test model is `gemini-2.5-flash-lite`.
- Added server-side model registry metadata for Gemini Flash-Lite/Flash and OpenAI placeholder routing.
- Added hard daily/monthly budgets, per-request estimated cost ceiling and token ceiling.
- Unknown model pricing is blocked instead of guessed.
- Added 15-minute response caching.
- Opening MAC no longer triggers an AI request; the user explicitly asks MAC before model usage.
- Deterministic schedule calculations remain AI-free.
- Added persisted `mac_usage` ledger for usage/audit information.
- Added `MINIMAL` data policy: task/resource names, descriptions, emails, external IDs, connector payloads and credentials are not sent to the model. User questions are redacted against known project/task/resource names.
- Autonomous MAC watch is disabled by default and gated by schedule-change fingerprints and the configured watch interval.

## PRMS → Gantt
- Correct PRMS token endpoint remains `https://prmscloud.com/api/account/token`.
- Added **Open in Gantt** to the PRMS Connector schedule screen.
- PRMS schedules are synchronized into a dedicated SI project using connector identities.
- Expected and actual dates are imported; actual dates remain source-owned.
- Expected date edits on PRMS-backed tasks write back through the authenticated PRMS endpoint and roll back locally if the external write fails.
- Invalid PRMS sentinel dates such as year 0001 are excluded from the Gantt timeline.
- PRMS hierarchy is preserved where the source provides parent relationships.
- PRMS connections automatically receive a one-hour minimum time-based synchronization when no interval is explicitly configured.
- Connector synchronization now prevents overlapping runs.

## Gantt
- Existing top project selector continues to expose all SI projects, including synchronized PRMS projects.
- Project switching reloads tasks, dependencies, resource pressure and intelligence for the selected project.
- Light-theme task/timeline separators use the same neutral grey visual system.
- Semantic task states remain shared between the left grid and right timeline.

## Security
- AI keys remain API-container/server-side only.
- MAC prompts contain minimized scheduling evidence rather than raw connector records.
- Connector credentials remain encrypted at rest.
- Connector destination protections remain active.

## Validation
- TypeScript parser checks were run on the API and UI source. Full dependency-backed Docker/Next/Prisma builds could not be executed in this environment because package installation timed out; the release must therefore be smoke-tested with the project's Docker build on the target machine.
