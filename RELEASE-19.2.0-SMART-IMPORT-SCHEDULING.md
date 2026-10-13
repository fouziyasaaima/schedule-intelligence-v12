# Schedule Intelligence v19.2.0 — Smart Import & Dependency Scheduling

## Focus
A simpler single-sheet schedule import model that lets users provide only what they know and lets SI calculate dependency-driven dates.

## Included
- Single-sheet general schedule template with Start, Duration, Duration Unit and Dependencies.
- Inline dependency editing in the Schedule task grid.
- Dependency formats: `1 FS`, `1 SS`, `1 FF`, `1 SF`, with optional lag such as `1 FS +1`.
- Imported duration units: hour, day, week, month and year.
- Missing successor dates are calculated from dependency chains and the first available anchor/project start.
- Dependent tasks become auto-scheduled; root tasks with explicit starts remain anchors.
- Import now runs a deterministic SI scheduling pass after the data is persisted.
- Invalid/cyclic scheduling does not invalidate the application; import remains recoverable and reports the scheduling signal.
- General Schedule export remains one sheet and now includes Dependencies and Duration Unit.
- Version updated to 19.2.0 across UI/API/Docker defaults.

## Intended workflow
`Excel → Understand → Import & schedule intelligently → Review → MAC optimize → Apply → Export`
