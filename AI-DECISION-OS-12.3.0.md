# Schedule Intelligence 12.3.0 — AI Decision OS

## What changed
- Multi-project selector in the Gantt toolbar. The selected project drives the entire schedule, network, forecast, impact and intelligence context.
- Shared semantic task-state palette across the task grid and Gantt bars: on-track, complete, critical, target-risk, overdue and resource-pressure.
- Light-theme grid/timeline separators are now explicitly neutral grey in both panes; legacy dark/black traces are overridden.
- AI Copilot panel with executive brief, material signals, evidence-task drill-down and natural-language schedule questions.
- Provider abstraction for OpenAI Responses API and Google Gemini Interactions API.
- AI findings are persisted in the existing `insights` table for audit/history.
- Optional autonomous AI watch cycle can create high-severity alerts and optionally email organization owners/admins/project managers.

## Environment
See `.env.example`.

- `AI_PROVIDER=gemini|openai`
- `GEMINI_API_KEY`, `GEMINI_MODEL`
- `OPENAI_API_KEY`, `OPENAI_MODEL`
- `AI_WATCH_ENABLED=false`
- `AI_WATCH_INTERVAL_MINUTES=60`
- `AI_NOTIFY_EMAIL=false`

Keys are API-container secrets only; they are never sent to the browser.

## AI design principle
Deterministic SI engines remain authoritative for dates, CPM, dependency propagation, target feasibility, resource load and Monte Carlo calculations. The language model interprets those verified signals, explains interactions and proposes previewable actions. It does not directly mutate the schedule.
