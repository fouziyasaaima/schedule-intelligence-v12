# Dependency Pair Integrity — v11.3.2

## Rule

A project may contain many predecessors for a successor task, but an active predecessor → successor pair may have **one and only one** dependency edge.

The dependency type (`FS`, `SS`, `FF`, `SF`) and lag/lead are properties of that single edge and must be edited rather than duplicated.

## Enforcement

1. UI/API creation rejects an existing active pair with HTTP `409`.
2. The API returns the existing dependency id, type and lag so a client can offer **Edit relationship**.
3. PostgreSQL/Prisma enforces a unique `(projectId, predecessorId, successorId)` constraint.
4. Container bootstrap normalizes legacy duplicate active edges by retaining the oldest edge before schema synchronization.

## Why

This keeps CPM, Gantt, Network, Monte Carlo and impact analysis unambiguous: every dependency edge has one semantic meaning.
