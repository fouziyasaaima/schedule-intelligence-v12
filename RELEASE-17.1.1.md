# Schedule Intelligence 17.1.1

## PRMS first-export destination model
- Export to PRMS now requires an explicit existing PRMS `ProjectId` / parent `E_ID`.
- A fresh PRMS root is created **under** that destination project.
- The newly returned root `E_ID` is the only PRMS root ID stored on the SI connector.
- Example: destination `7707` -> newly created root `8927` -> SI connector uses `8927`.
- PRMS hierarchy rebuild runs against the newly created root, not the destination parent.
- Added server-side validation so a missing/non-numeric destination cannot publish.

## Export integrity
- Added post-create verification that every SI task received a PRMS E_ID before the publish is reported successful. This prevents silent omissions such as a missing Thermal Shock task.

## PRMS dialog UX
- Reworked the export dialog to use a stable viewport with an independently scrollable body.
- Added a dedicated destination ProjectId card and review destination indicator.
- Improved review table sizing and sticky header behavior.
- Connector cards show the persisted PRMS root E_ID for PRMS connections.
- The original destination parent ProjectId is retained as connector metadata while the active `prms.projectId` remains the newly created root.
