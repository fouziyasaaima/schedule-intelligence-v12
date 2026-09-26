# Schedule Intelligence 17.1.0

## PRMS first-time export + Resource Orbit assignment completeness

### PRMS — fresh-project export flow
- Added **Export → PRMS → Export to PRMS** directly from the active SI schedule.
- First-time PRMS export no longer requires the user to pre-create a PRMS connector.
- Added a four-step guided flow:
  1. PRMS connection readiness
  2. SI → PRMS data mapping review
  3. PRMS hierarchy/member preview and confirmation
  4. PRMS root creation and connection establishment
- A bootstrap PRMS connector is created only for the controlled export workflow and is removed if the user cancels before publishing.
- After successful PRMS creation, the connector is updated with the newly created PRMS root `E_ID` and remains available under **Connectors**.
- Mapping metadata is persisted on the connector and exposed through Connector Studio.
- Existing PRMS connections for the current SI project are detected so the first-time export flow does not create a second PRMS root accidentally.

### Resource Orbit
- Fixed the assignment panel truncation caused by `tasks.slice(0, 8)`.
- The assignment list now exposes the complete current project's work-item set.
- Added an inline work-item search so large schedules remain easy to navigate.
- Added an explicit empty state when a search returns no matching work item.

### Version
- UI/package version: `17.1.0`
- Product identity remains **Schedule Intelligence**.
