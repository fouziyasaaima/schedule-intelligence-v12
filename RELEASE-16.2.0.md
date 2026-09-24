# Schedule Intelligence 16.2.0 — PRMS Data Exchange & Safe Project Publish

Base: `Schedule-Intelligence-v16.1.0-MAC-INTELLIGENCE-WORKSPACE`

## What is new

### 1. PRMS project creation from SI
- New PRMS **Publish** workspace in Connector Studio.
- Select an existing SI project and prepare a publish preview.
- SI creates the PRMS root event first, captures its numeric `E_ID`, then creates the complete task hierarchy beneath it.
- Parent/child relationships are resolved from SI hierarchy, never treated as dependencies.

### 2. Correct PRMS date semantics
For a fresh PRMS event:
- `E_StartExpectedDay` = SI expected start.
- `E_EndExpectedDay` = SI expected finish.
- `E_StartDate` initially equals `E_StartExpectedDay`.
- `E_FinishDate` initially equals `E_EndExpectedDay`.

After creation, actual dates remain source-owned; schedule changes should update expected dates rather than overwrite execution history.

### 3. Numeric `E_Leader` resolution
Excel/source data remains human-readable and does **not** require `ID_Member`.

SI calls:
- `GET /api/prms/ListUsers`

Resolution order:
1. Existing PRMS member identity.
2. Exact member/name match.
3. Explicit user-selected mapping in the Publish workspace.
4. Never generate or guess a member ID.

Ambiguous or unresolved people are surfaced for explicit user resolution. Optional `E_Leader = 0` publication is available only through an explicit user choice.

### 4. Resource Orbit separation
- People are candidates for PRMS `E_Leader`.
- Equipment, facilities, instruments, materials, consumables and other resource types remain SI resources and are not incorrectly written into `E_Leader`.
- Resource capacity remains part of SI scheduling rather than being forced into a PRMS person field.

### 5. Folder structure rebuild
After all PRMS events are successfully created:

`POST /api/event/rebuildstructure?ProjectId=<root E_ID>`

is executed so PRMS can rebuild the documentation/folder structure from the newly-created hierarchy.

### 6. Audit-friendly publish preview
Before publishing, the user can see:
- SI task count.
- PRMS member count.
- unresolved leader mappings.
- expected dates.
- parent relationships.
- resolved PRMS member IDs.

## Existing functionality preserved
This release is based on 16.1.0 and retains the existing Gantt, Resource Orbit, MAC, connector, PRMS schedule import, expected-date write-back, Google Sheets, Microsoft Excel, dependency, forecasting and export functionality.

## Important safety rule
MAC/LLM is not used to invent PRMS member IDs. Member resolution is deterministic and user-confirmable.
