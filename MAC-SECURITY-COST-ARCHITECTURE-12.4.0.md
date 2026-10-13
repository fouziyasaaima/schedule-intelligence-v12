# MAC 12.4.0 — Security & Cost Architecture

MAC is **Schedule Intelligence's reasoning engine**. The scheduling engine remains deterministic and is never replaced by the model.

## Cost controls
- Gemini 2.5 Flash-Lite is the default test model.
- Daily and monthly budgets are enforced before model calls.
- Per-request cost and token ceilings are enforced before model calls.
- Unknown model pricing is blocked rather than guessed.
- Deterministic questions do not call a model.
- MAC panel opening does not call a model.
- Fifteen-minute response cache prevents repeated identical requests.
- Autonomous watch is disabled by default and has a deterministic change gate.
- Usage is persisted in `mac_usage` for auditability.
- Connector sync has an in-flight lock to prevent duplicate runs.

## Data minimization
The default `MINIMAL` policy sends only:
- schedule dates
- progress percentages
- status
- critical/slack/target-risk signals
- dependency counts
- resource allocation percentages and assignment counts
- forecast results

Task names, resource names, descriptions, emails, connector credentials, external IDs and raw connector payloads are not sent to the model. User questions are redacted against known project/task/resource names before being added to the prompt.

## Security
- Provider API keys remain server-side.
- No `NEXT_PUBLIC_*` AI secret is supported.
- Gemini requests use `store:false` where supported by the configured API path.
- AI output is treated as advisory structured data and cannot directly mutate the schedule.
- Expected PRMS dates write back through the authenticated PRMS connector boundary; actual dates remain source-owned.
