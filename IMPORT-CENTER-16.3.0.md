# Import Center — Schedule Intelligence 16.3.0

## Where to find it

Open **Connectors** from the left navigation rail. The Connector Studio header now contains:

**Import Excel / CSV**

## Excel / CSV

1. Select the target Schedule Intelligence project.
2. Choose `.xlsx`, `.xls`, or `.csv`.
3. SI discovers the workbook sheets.
4. `Test Schedule` is selected automatically when present.
5. `Resources Checklist` is selected automatically when present.
6. Review detected task/resource counts.
7. Click **Import into selected project**.

## Supported template columns

### Test Schedule

- ID
- WBS / Test No.
- Task Name
- Duration (hrs)
- Start
- Finish
- Test Category
- Equipment / Facility
- Consumables / Utilities
- Test Procedure / Data Sheet
- Operator / Owner
- Status
- Notes

### Resources Checklist

- Test / Activity
- Resource Type
- Item Required
- Purpose
- Qty / Capacity
- Availability / Reservation
- Owner
- Status
- Notes

## Resource behavior

- Operator / Owner becomes a PERSON resource when a person is supplied.
- Equipment, facilities, instrumentation, fixtures, safety items and consumables are represented as non-person resources.
- Resource checklist capacity is used when supplied. If the source does not provide capacity, SI keeps its scheduling baseline defaults; the source has not been treated as a verified capacity.
- Resource assignments are scoped to the selected project.

## WBS behavior

Where WBS values imply containment, SI establishes parent/child hierarchy and marks tasks with children as SUMMARY tasks.

## PRMS behavior

Import is SI-only. It does not call PRMS.

When the user later opens the PRMS Publish workflow:

1. SI resolves person resources using `/api/prms/ListUsers`.
2. `Id_Member` is used only internally to populate `EventsData.E_Leader`.
3. Numeric member IDs are never required in the Excel file.
4. SI creates the PRMS root/event hierarchy through `/api/prms/saveevents`.
5. The numeric root `E_ID` returned by PRMS becomes the `ProjectId` for `/api/event/rebuildstructure`.
6. The project folder hierarchy is rebuilt after the events exist.

## Google Sheets

The Import Center also provides a Google Sheets path. It uses an existing connected Google Sheets connector and its saved mapping contract, then imports into the selected SI project.
