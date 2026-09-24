# Project Graph & MAC Autopilot Contract

Schedule Intelligence 12.5.0 uses a single conceptual graph.

## Relationship types

1. **Hierarchy**
   - `parentId`
   - Parent/child tree only.
   - Does not imply sequencing.

2. **Scheduling dependency**
   - predecessor → successor
   - FS / SS / FF / SF + lag.
   - Drives deterministic schedule propagation.

3. **Resource assignment**
   - task ↔ resource
   - allocation percentage and semantic role.

## PRMS normalization

Events and Actions are normalized into the same task contract before persistence. IDs are external identities (`E123`, `A456`) while SI internal IDs remain opaque database identifiers.

## MAC scheduling

MAC reasons over a structured project representation and returns proposals. The application validates references, confidence, duplicates, self-links and cycles. Only validated proposals can be applied. The deterministic CPM engine recomputes the final schedule.

Actual dates and source-owned data are protected. Autonomous runs are snapshot-backed and reversible.
