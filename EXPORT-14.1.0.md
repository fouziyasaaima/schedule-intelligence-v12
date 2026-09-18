# Schedule Intelligence 14.1.0 — Export Center

Adds a first-class schedule export surface for the selected project.

## Formats
- CSV — flat schedule data.
- Excel XLSX — Schedule, Resources, Dependencies, and Schedule Intelligence sheets.
- PDF + Gantt — printable schedule table and deterministic timeline visualization.
- JSON — portable schedule snapshot containing project, tasks, and active dependencies.
- Print report — browser print/save-as-PDF path.

## Safety
Exports are generated from the already loaded project schedule. Connector credentials, API keys, client secrets, and connector configuration are not exported.

Actual dates and expected/planned dates remain separate in the exported schedule.
