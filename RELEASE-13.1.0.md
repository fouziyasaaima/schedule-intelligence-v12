# Schedule Intelligence 13.1.0 — BEYOND Hierarchy Flow

## What changed

### 1. Bidirectional hierarchical scheduling
- Parent/summary rows are now editable.
- Editing a parent start/finish propagates through the entire descendant subtree.
- A pure parent move translates all descendants while preserving durations.
- A parent resize scales descendant positions into the new parent window while preserving relative order.
- Editing a child continues to derive the parent/grandparent range from descendant dates.
- Hierarchy (`parentId`) remains separate from dependency/predecessor links.

### 2. Timeline editing
- Every Gantt bar supports move.
- Every Gantt bar supports start-edge resize and end-edge resize.
- Summary/parent bars are no longer blocked from dragging.
- The grid date controls are editable for parent rows too.
- Visual cues indicate that parent edits propagate through the hierarchy.

### 3. PRMS write-back safety
- A hierarchy edit captures the complete affected local change set.
- All affected externally mapped PRMS entities are written back, rather than only the clicked task.
- If the external source rejects a write, local changes are restored and best-effort compensating write-back is attempted.
- Actual/source-owned dates remain protected; the editable schedule uses expected dates.

### 4. PRMS hierarchy and resource mapping retained
- PRMS `E_ID_Dependance` → Gantt `parentId` for events.
- PRMS action `E_Id` → event parent.
- Event resource: `E_Leader` → resource external ID and `Initial_Member` → resource name.
- Action resource: `ID_Member` → resource external ID and `AssignedTo` → resource name.
- External IDs continue to display as PRMS-style identifiers such as `E10576` and `A6861`.

## Important behavior

Parent/child containment is **not** a predecessor dependency. Dependency arrows continue to represent FS/SS/FF/SF scheduling constraints.

This release requires no Prisma schema change.
