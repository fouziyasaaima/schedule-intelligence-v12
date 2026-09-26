# Schedule Intelligence 17.2.1 — API Build Fix

## Fix
- Fixed the API TypeScript build failure in `src/routes/resources.ts` by importing `computeSchedule` from `src/scheduling/cpm`.
- The large-data Resource Intelligence endpoint now correctly resolves the CPM helper used to calculate criticality, slack, and materiality signals.

## Build validation
- Source-level verification completed for the missing symbol/import.
- Full local TypeScript compilation was not available in this environment because the source package does not include a package lock/node_modules and dependency installation could not complete within the available build environment.
- The reported Docker error was specifically `TS2304: Cannot find name 'computeSchedule'`; this fix addresses that exact failure.

## UI warning
The Next.js build warning about Autoprefixer and `flex-end` is a CSS compatibility warning, not the cause of the Docker failure.
