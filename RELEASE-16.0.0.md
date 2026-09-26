# Schedule Intelligence 16.0.0 — MAC Intelligence OS

Major release built on Schedule Intelligence 15.0.1.

## What changed

### MAC becomes a conversational scheduling intelligence layer
- Persistent in-panel conversation for the selected project.
- User questions remain visible above MAC answers.
- MAC answers appear as structured conversational responses rather than replacing the question.
- Thinking state while MAC is reading project evidence.
- Suggested high-value questions for first-time use.
- Follow-up questions can be asked without losing the previous conversation in the open panel.
- Selected-task "Explain this task" action now enters the conversation directly.

### Evidence-first answers
- MAC receives task names, descriptions, hierarchy references, deterministic dates, progress, critical/slack signals and dependency relationships.
- MAC receives project-scoped resource names, types, roles, capacities, availability, allocations and assigned task names.
- The LLM is explicitly instructed to use supplied evidence only and never expose internal resource references.
- The API response includes an evidence package for the UI so users can inspect what MAC was allowed to reason over.
- Deterministic schedule calculations remain the source of schedule truth.

### Resource-aware reasoning
MAC can now reason using:
- people
- equipment
- vehicles
- facilities
- other capacity resources
- hours/day
- units
- availability percentage
- allocation pressure
- assigned work

### MAC Autopilot
- Analyze the whole project.
- Generate a proposed change plan.
- Run autonomous scheduling only when explicitly enabled by policy.
- Preserve reversible schedule history and rollback behavior.

### Theme and UX hardening
- Fixed MAC input contrast in dark mode.
- Fixed MAC input contrast and placeholder behavior in light mode.
- Added explicit focus states.
- Added conversational visual hierarchy.
- Added evidence panel and schedule-read sections.
- Added MAC version badge.

## Existing functionality preserved
This release is additive and remains based on 15.0.1:
- Gantt scheduling
- project-scoped Resource Orbit
- resource creation and capacity
- dependencies
- PRMS import/connector flows
- autonomous scheduling
- schedule history/rollback
- exports
- multi-scale timeline
- light/dark mode
- forecast and intelligence modules

## Build

Build UI and API separately or with Docker Compose. The source archive intentionally does not contain node_modules; install dependencies before running TypeScript/Next builds.
