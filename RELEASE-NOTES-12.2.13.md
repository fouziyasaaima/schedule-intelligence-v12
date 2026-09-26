# Schedule Intelligence 12.2.13

## Product architecture
- PRMS is treated as a native external provider; Schedule Intelligence remains an independent product.
- PRMS configuration in the Connector UI now asks only for Project ID.
- PRMS credentials and token exchange remain server-side.

## PRMS
- Added native live schedule preview using the PRMS EventsHierarchy and ActionHierarchybyProject contracts.
- Actual dates are displayed as source-owned/read-only data.
- Expected dates are the SI-controlled scheduling layer and can be written back through UpdateExpectedDates.
- Token acquisition uses POST /api/token with Bearer bootstrap authentication and ClientId/ClientSecret JSON, extracting `accessToken`.
- Project IDs are validated before upstream URL construction.
- Connector schema now explicitly preserves native PRMS/Google/Microsoft configuration instead of silently stripping provider-specific fields.

## Gantt
- Added a subtle Actual execution track beneath the Expected bar when actual dates exist.
- Ongoing actual work is rendered through today rather than inventing an actual finish date.
- Light mode receives an authoritative final surface pass to eliminate legacy dark Gantt traces and heavy black row lines.
- Existing fixed-header/vertical-scroll architecture is preserved.

## Reliability
- PRMS test validates the native project schedule rather than a legacy arbitrary endpoint.
- Connector creation errors are surfaced instead of silently swallowed.
