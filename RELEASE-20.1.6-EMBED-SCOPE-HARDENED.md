# Schedule Intelligence 20.1.6 — Embedded Project Scope Hardened

Fixes the compiled API runtime so embedded project scope resolution matches the source implementation.

## Fixed
- PRMS external project references resolve through connectorIdentity before project-scope comparison.
- Canonical SI project IDs remain supported.
- Tenant/organization isolation is preserved.
- Embedded project scope errors include requestedProject for diagnostics.
- Runtime dist/plugins/auth.js is synchronized with src/plugins/auth.ts.
- Version bumped to 20.1.6.

## Preserved
- Automatic PRMS project synchronization from 20.1.5.
- Application-level rate limiting removed from 20.1.3.
- Project-scoped embed token security remains enabled.
