# Schedule Intelligence 17.0.0 — SISF Universal Data Exchange

## Release intent

17.0.0 establishes the Schedule Intelligence Standard Format (SISF) as the neutral, vendor-independent schedule interchange contract. Excel is the human-editable representation; SI remains the canonical scheduling engine.

## Functional changes

- Downloadable `SI-Standard-Schedule-v1.0.xlsx` from Import Center and Export Center.
- Universal workbook sheets: Instructions, Project, Tasks, Dependencies, Resources, Assignments, Calendars, Calendar Exceptions, Custom Fields, SISF_Metadata.
- Fresh Excel/CSV import creates a new SI schedule by default. PRMS project selection is intentionally deferred until Publish to PRMS.
- Existing SI schedule update mode is supported through SISF identities and deterministic upsert behavior.
- SISF Task ID / Resource ID identities are persisted through the built-in SISF connector identity boundary, enabling round-trip Excel edits.
- Parent Task ID is a local SISF identity; PRMS E_ID / E_ID_Dependance are never required in the template.
- Dependencies and resource assignments import as first-class scheduling objects.
- Resource types include people, equipment, facilities, vehicles, materials, teams and other resources.
- Custom task/resource fields are retained as JSON metadata.
- Existing external Excel/CSV formats continue to be supported through mapping heuristics.
- Existing PRMS connector/publish workflow remains separate and user-controlled.
- Existing CSV, Excel, PDF, JSON and Print exports remain available; Excel export now follows SISF v1.0 for round-trip compatibility.
- Application/API version is 17.0.0.

## Safety contract

AI/MAC may assist with interpretation and scheduling recommendations, but it is not permitted to invent SISF identifiers, silently change hierarchy, or publish external changes without the existing user-controlled publish workflow.
