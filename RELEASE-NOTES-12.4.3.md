# Schedule Intelligence v12.4.3 — Hierarchical Summary Dates

## PRMS hierarchy
The PRMS connector continues to merge Events + Actions and map the PRMS hierarchical parent relationship to `parentId`. `parentId` is not a predecessor/dependency.

## Hierarchical Gantt
- Tasks are rendered as a tree using `parentId`.
- Parent rows show expand/collapse controls and child indentation.
- The task sidebar and timeline use the same visible hierarchy/order.
- Summary/parent task date fields are read-only because their dates are derived from descendants.

## Summary date propagation
For every task with children:
- Expected Start = earliest descendant Expected Start.
- Expected End = latest descendant Expected End.
- Actual Start = earliest available descendant Actual Start.
- Actual End = latest Actual End only when every descendant has finished; otherwise the summary remains ongoing (`null`).
- Date aggregation is recursive, so changes propagate through parents, grandparents, and higher ancestors.
- Dependency-driven child moves are included in a second summary pass after CPM recomputation.

## Editing
Changing a leaf/child Expected Start or Expected End recalculates all ancestor summary ranges. Direct editing of a summary task date is rejected by the API with `SUMMARY_DATES_DERIVED`.

## PRMS synchronization
After a PRMS import, the merged hierarchy is recomputed so parent/summary dates immediately reflect the imported descendants.
