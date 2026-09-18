# Schedule Intelligence v12.0.5 — Build Fix

## Fixed
- Fixed the UI TypeScript build failure in `ResourceOrbit.tsx`.
- Removed an unused `initialResourceId` destructuring from `ResourceDetail`, where that prop was not part of the component type.
- Retains v12.0.4 Gantt vertical scroll stabilization, responsive/mobile work, theme hardening, Intelligence drill-down, and Monte Carlo launch behavior.

## Verification
- API package version: 12.0.5
- UI package version: 12.0.5
- Release package source has been statically checked for the reported type mismatch.
