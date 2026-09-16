# v11.4.0 — Large Dataset Intelligence

This release establishes the large-data visualization contract across Gantt, Network, Pulse, Resource Orbit, Impact and Monte Carlo.

## Principles
- Aggregate first; render material signals; drill down on demand.
- Keep backend calculations authoritative.
- Avoid browser-side rendering of unnecessary simulation/network detail.
- Preserve explicit feedback for loading, validation and errors.

## Developer fixture
Developer seed creates **Large Dataset Lab · 300 Tasks** with 12 workstreams, dependencies, milestones, 30 resources and assignments. It is idempotent and does not modify Sample Rollout.

## Visualization behavior
- Monte Carlo uses aggregated histogram/risk attribution rather than individual simulation paths.
- Network focuses on a bounded material neighborhood for large projects.
- Pulse shows aggregate health signals and top drivers.
- Resource Orbit avoids one request per resource and uses aggregate leveling data.
- Impact presents the material downstream set while preserving the full backend calculation.
- Gantt uses browser containment/content-visibility and bounded dependency rendering for large task sets.
