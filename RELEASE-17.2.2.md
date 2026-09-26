# Schedule Intelligence 17.2.2

## Import validation fix

- Fixed SISF dependency import validation for Excel dependency types `FS`, `SS`, `FF`, and `SF`.
- The API now normalizes these abbreviations to `FINISH_TO_START`, `START_TO_START`, `FINISH_TO_FINISH`, and `START_TO_FINISH`.
- The UI importer also normalizes dependency types before sending the import payload.
- Existing `Calendar Exceptions` four-column structure remains unchanged.

## Root cause
The workbook correctly uses the SISF-friendly dependency codes `FS/SS/FF/SF`, but the v17.2.1 importer sent `FS` directly to an API schema that only accepted the full enum names. This produced HTTP 400 `Validation failed`.
