# Schedule Intelligence 16.3.0 — Data Exchange Import Center

## Purpose

16.3.0 adds the actual, user-visible import workflow that was missing from 16.2.0. It is based on the 16.2.0 PRMS Data Exchange foundation.

## Functional import sources

- Excel `.xlsx` / `.xls`
- CSV
- Google Sheets through an existing configured Google Sheets connector

## Excel / CSV flow

1. Open **Connectors** in the left rail.
2. Select **Import Excel / CSV**.
3. Select the target Schedule Intelligence project.
4. Choose the workbook or CSV.
5. SI discovers the schedule sheet and optional resource sheet.
6. SI previews the detected tasks/resources.
7. Import into the selected project.

The importer recognizes the provided `Environmental_Test_Schedule_and_Resources.xlsx` structure:

- `Test Schedule`
- `Resources Checklist`

It maps WBS, task name, duration, dates, category, equipment/facility, consumables/utilities, procedure, owner, status and notes.

## Resource intelligence

Resource checklist rows become Resource Orbit resources. People are represented as PERSON resources; equipment, facilities, instrumentation, materials and other non-human resources remain separate resource types.

`Operator / Owner` remains a human-readable name. No numeric PRMS `Id_Member` is inserted into the spreadsheet. PRMS member resolution remains deterministic and happens through `/api/prms/ListUsers` during PRMS publish.

## Safe PRMS lifecycle

Importing into SI does **not** write to PRMS.

The intended flow is:

`Import → Validate → Schedule/MAC → Review → PRMS Publish → SaveEvents → capture root E_ID → RebuildStructure`

Fresh PRMS events use SI expected dates as their initial actual dates, while subsequent scheduling changes preserve the distinction between expected and actual execution dates.

## API

`POST /v1/projects/:projectId/import`

The endpoint validates the canonical import payload, creates/updates project resources, creates/updates tasks, assigns imported resources, and applies WBS containment where possible.

The API body limit is 10 MB to support larger spreadsheet imports.

## Version

- UI: 16.3.0
- API: 16.3.0

## UI location

**Left rail → Connectors → Import Excel / CSV**

The Import Center is intentionally separate from PRMS publishing so users can inspect and schedule imported data before any external write.
