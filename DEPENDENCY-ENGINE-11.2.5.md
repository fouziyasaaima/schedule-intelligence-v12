# Schedule Intelligence 11.2.5 — Dependency Engine Hardening

- Gantt dependency creation supports all four relationship types through start/finish anchors.
- Dropping on the left half of a task chooses its Start anchor; the right half chooses Finish.
- Gantt dependency paths are rendered from the correct relationship anchors (FS, SS, FF, SF).
- Relationship chips show FS / SS / FF / SF directly on the timeline.
- Task sidebar adds Task Grid / Predecessors / Details tabs.
- Predecessor and successor links can be inspected and edited for relationship type and lag/lead.
- API supports PATCH `/v1/dependencies/:id` for relationship changes.
- Date edits recompute the entire dependency graph and persist propagated dates.
- Linked successors become dependency-driven automatically; manual date entry remains a lower-bound anchor while hard dependency constraints can propagate later dates.
- Duplicate dependencies are rejected with a clear conflict response.
