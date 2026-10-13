# Schedule Intelligence v17.4.5

## Functional fixes

- Resource Orbit is now a true full-screen workspace instead of being constrained by the Gantt content area.
- Resource selection/details now opens from Schedule, Timeline and Impact views, not only Orbit.
- Resource assignment controls remain usable from the selected-resource panel.
- UI/API/Docker version metadata is aligned to 17.4.5.
- PRMS export keeps the newly created root E_ID as the connector/root mapping.
- `/api/event/rebuildstructure` receives the user-entered destination `ProjectId`, not the newly created root E_ID.
- Excel imports with no operator/owner use PRMS `Id_Member = 2` as the agreed fallback during PRMS export.
