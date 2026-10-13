# Schedule Intelligence v20.1.7 — Embedded Full Functional Scope

## Fix

Embedded session creation is now a trusted server-to-server bootstrap operation. The calling SI API key authenticates the host integration but its individual functional scopes are no longer intersected with the embedded token scopes.

The short-lived, project-scoped embed token receives the complete functional project scope set required by the embedded Schedule Intelligence experience:

- projects:read
- projects:write
- tasks:read
- tasks:write
- dependencies:read
- dependencies:write
- resources:read
- resources:write
- schedule:read
- schedule:write
- forecast:read

Connectors and organization-level administration remain unavailable to the embedded token. Project and organization isolation remain enforced by the signed embed token.

Automatic PRMS project provisioning/synchronization is also no longer blocked by the parent API key's connector scope; the server-side embed bootstrap may perform the configured PRMS synchronization, while the browser receives only the short-lived project-scoped token.
