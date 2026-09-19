# Monte Carlo Forecast Integrity — v11.3.3

## Problem fixed

Monte Carlo previously measured simulated finish duration from the stored project start date. If project metadata started after the actual task schedule, valid simulated finishes could fall before that anchor and be clamped to `0d`.

## v11.3.3 model

1. Load the real project tasks and active dependencies.
2. Validate the real dependency graph for cycles.
3. Run the canonical CPM scheduler first, so Monte Carlo starts from the same deterministic schedule shown by the Gantt.
4. Use the earlier of the explicit project start and earliest scheduled task start as the forecast origin.
5. Sample each real task duration using the configured triangular uncertainty range.
6. Propagate each sample through the same FS / SS / FF / SF dependency semantics.
7. Measure simulated project finish relative to the forecast origin.
8. Calculate P50, P80, P90, P95, mean, target confidence, histogram and simulation-derived risk drivers.

This keeps the probabilistic forecast anchored to the real schedule rather than to stale project metadata.
