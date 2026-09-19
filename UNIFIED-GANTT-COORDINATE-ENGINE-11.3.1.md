# Unified Gantt Coordinate Engine — 11.3.1

## Contract

The task grid and timeline share the same task ordering and row height (`ROW_HEIGHT = 40`). The left sidebar consumes 38px dependency tabs + 38px task header; the timeline now consumes the same 76px header before its first task row.

The timeline date-to-pixel mapping is shared by day columns, task bars, dependency anchors, dependency labels and the Today marker.

## Dependency semantics

- FS = predecessor finish → successor start
- SS = predecessor start → successor start
- FF = predecessor finish → successor finish
- SF = predecessor start → successor finish

A task with incoming dependencies is dependency-driven. Its earliest legal start is derived from its active incoming relationships; root tasks retain their manually entered placement. This makes zero-lag SS visually and logically align the two starts and allows predecessor movement to propagate to successors in either direction.

## Visual language

Selected-task incoming links are labeled `PREDECESSOR` and emphasized as cyan; outgoing links are labeled `SUCCESSOR` and emphasized as amber. Unrelated links recede visually. The same semantics are used in the Timeline and Dependency Network.

## Validation checklist

1. A → B, SS +0d: A and B start on the same timeline column.
2. A → B, SS +2d: B starts exactly two schedule days after A.
3. A → B, FF +0d: A and B finish on the same column.
4. A → B, SF +0d: B finishes on A's start column.
5. Moving a predecessor later recomputes dependency-driven successors.
6. Left start/end values align with the right bar's actual X coordinates.
7. Left task row and right task bar share the exact same Y row.
8. Selecting a task clearly distinguishes incoming predecessors from outgoing successors in both views.
