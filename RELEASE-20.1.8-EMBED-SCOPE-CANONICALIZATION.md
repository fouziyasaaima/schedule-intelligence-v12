# Schedule Intelligence 20.1.8 — Embedded Scope Canonicalization

## Fix
Embedded PRMS sessions could still return `EMBED_PROJECT_SCOPE` when the browser requested the same project through an external PRMS reference while the signed embed token contained the canonical SI project id.

## Changes
- The signed embed token remains authoritative for the canonical SI project.
- PRMS connector identity resolution first searches for an identity whose `internalId` is the signed token project, preventing stale/duplicate connector identities from selecting another SI project.
- Project route parameters are normalized to the canonical SI project id before route handlers execute.
- Both `:id` and `:projectId` route parameters are normalized where applicable.
- Scope failures now return `requestedProject` and `resolvedProject` diagnostics.
- The complete functional embedded scope set remains independent of the parent API-key functional scopes.
- Connector/admin scopes are still excluded from the browser embed token.
- Automatic PRMS provisioning/synchronization remains enabled.
- The application rate limiter remains removed as in 20.1.3.
