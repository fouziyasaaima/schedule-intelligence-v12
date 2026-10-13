# Schedule Intelligence 20.1.5 — Automatic PRMS Project Provisioning

## Embedded PRMS flow

When an embedded session is requested with a PRMS project id and the project is not yet synchronized into Schedule Intelligence, the API now automatically:

1. validates the PRMS server configuration;
2. creates a server-side PRMS connector for that project when one does not already exist;
3. synchronizes the PRMS project, tasks, hierarchy, dates, and resources;
4. records the `PRMS:<projectId>` connector identity;
5. resolves the canonical SI project id; and
6. mints the short-lived project-scoped embed token.

Existing synchronized projects use the identity fast path and are not unnecessarily synchronized on every embed open.

Older PRMS callers that send only a numeric `projectId` are also recognized automatically. Explicit `projectSource: "prms"` remains supported.

## Security

Automatic provisioning requires the calling server-side SI API key to have `connectors:write` (or `admin`). The resulting browser token does not receive connector administration scopes. PRMS credentials remain server-side.

Set `EMBED_AUTO_SYNC_PRMS=false` to disable automatic provisioning.
