# Schedule Intelligence v17.3.0 — Simplified Import Experience

## Goal
Make schedule import feel simple for normal users while preserving the rich SI scheduling model behind the scenes.

## User-facing changes
- New Quick Start template with only Instructions, Tasks, Resources and Dependencies.
- Assignments, Calendars, Calendar Exceptions and Custom Fields are no longer required for normal imports.
- Import Center automatically detects the task sheet and resource sheet.
- Advanced sheet mapping is hidden behind an optional "Show advanced mapping" control.
- The importer understands a `Resources` column on the Tasks sheet.
- Resource names mentioned in Tasks are automatically promoted into the resource model when they are not defined in a Resources sheet.
- Import summary uses plain-language counts and issues instead of leading with SISF terminology.
- PRMS remains a separate publish destination.

## Data-model behavior
The API continues to receive the full normalized SI payload. The simplified workbook does not weaken the internal scheduling model; SI constructs the missing relationships where possible.

## Template
`SI-Quick-Start-Schedule-v1.0.xlsx`

## Version alignment
UI, API and root VERSION are aligned to 17.3.0.
