# Schedule Intelligence 17.2.0 — Adaptive Scheduling + MAC Materiality

## Purpose
This release makes large imported schedules easier to understand and schedule. It preserves the Orbital visual experience while introducing a decision-sized Scheduling Hub and a deterministic materiality layer for MAC.

## Resource experience
- Added **Schedule** mode beside Orbit, Timeline and Impact.
- Large projects automatically surface a materiality-first scheduling workspace.
- Resource assignment panels show the most relevant unscheduled work first instead of rendering the entire task universe.
- Users can search and explicitly browse the full matching work set on demand.
- Scheduling Hub surfaces unassigned work, critical work, resource pressure and the most material resource signals.
- The backend resource index uses deterministic CPM/slack, target-risk, overdue, dependency-pressure and assignment signals.
- Project-linked but currently unassigned resources are now included in MAC's scheduling resource universe.

## MAC large-data architecture
- MAC schedule reasoning now uses a deterministic materiality ranking before model execution.
- Projects with 500+ tasks use a focused task slice; 1,000+ task projects use a larger but still bounded material slice.
- Boundary dependencies are supplied so the model understands that the focus slice is not the entire graph.
- MAC explicitly reports focus mode and the number of excluded tasks.
- Baseline persistence and deterministic CPM validation still operate against the complete project.
- Resource candidates include project-linked available resources, not only already-assigned resources.
- Existing safety gates, confidence thresholds, snapshots and rollback remain unchanged.

## UX principle
**The complete dataset remains authoritative; the user only sees the decisions that matter.**

## Validation
- TypeScript syntax was checked with the repository compiler. Full dependency-backed UI/API builds could not be completed in this environment because `node_modules` is not present and dependency installation timed out.
- Docker build remains the final production compilation gate.
