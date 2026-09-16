# v11.2.2 — Viewport Integrity & Primary View Isolation

Focused correction release for Gantt/Network/Resources/Pulse viewport behavior.

- Network and Pulse are rendered in the main content flow instead of fixed overlays.
- Network zoom uses a scaled world inside a correctly sized scroll space, avoiding double scaling.
- Resource Orbit visualization is constrained to the remaining viewport and calculates orbit radius from its actual container.
- Primary application views cannot create phantom rows or cover the topbar/schedule content.
- Insights now shows project-level intelligence when no task is selected and task-level explanation when a task is selected.
