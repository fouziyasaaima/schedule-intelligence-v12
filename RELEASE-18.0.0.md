# Schedule Intelligence v18.0.0 — MAC Active Scheduling

## Major release focus
Schedule Intelligence v18.0.0 turns MAC from a separate analysis surface into an active scheduling companion throughout the scheduling journey.

### MAC
- MAC is launchable from the global navigation in every module.
- MAC is module-aware: Schedule, Network, Resources, Forecast, Impact, Pulse, Intelligence and Connectors.
- Natural-language MAC requests are classified as information or action requests.
- Action requests are converted into a validated schedule proposal.
- Safe, evidence-supported requests can be applied automatically when `MAC_CHAT_AUTO_APPLY=true`.
- Invalid requests are rejected before schedule changes are committed, with a user-facing reason.
- Dependency cycles, invalid date ranges, actualized-task date edits and resource-capacity violations are rejected.
- Every applied MAC schedule change remains reversible through the existing schedule-run/snapshot mechanism.

### MAC conversation UX
- Composer remains visible at the bottom of the MAC panel.
- Conversation automatically scrolls to the newest user request / MAC response.
- The user no longer has to scroll back to find the response.
- The MAC header identifies the active module context.

### General Schedule import
- Added a simplified single-sheet Schedule template.
- Core columns: ID, Task Name, Parent, Start, Duration, End, Predecessor, Resource, Owner, Priority, Status, % Complete, Notes.
- Duration supports hours/minutes (for example `5h`, `2h 30m`, `90m`, `1d`).
- When Duration is supplied, SI calculates End from Start + Duration.
- End can be supplied for fixed-finish imports.
- Advanced Assignments, Calendars and Calendar Exceptions are no longer required for a normal import.

### Precise scheduling duration
- Added optional `durationMinutes` to the Task model.
- Existing `durationDays` remains for backward compatibility.
- CPM now schedules using minute precision while retaining slack reporting in days.
- Existing projects continue to work through durationDays fallback.

### PRMS compatibility
- Existing PRMS expected-date synchronization continues to use ISO DateTime values so time is preserved.
- Existing default member fallback remains available for exports when no user/member is supplied.

## Safety principle
No invalid MAC action should be allowed to corrupt or halt a project. A rejected change must leave the prior schedule unchanged.
