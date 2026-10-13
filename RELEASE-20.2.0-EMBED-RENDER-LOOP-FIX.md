# Schedule Intelligence 20.2.0 — Embedded Render Loop / Schedule Visibility Fix

## Root cause

The embedded page effect depended on the `connect` function returned by `useConnection()`. `ConnectionProvider` recreated `connect` on every provider render. The embedded page therefore re-ran its initialization effect, called `connect()` again, replaced the configuration object, and triggered another render. This produced a continuous initialization/load cycle.

The visible symptom was the Schedule workspace repeatedly showing and hiding:

- `Aligning the schedule…`
- `Loading tasks, dependencies and computed signals`

The schedule was not failing because the token could not be created; the UI was repeatedly restarting its data-loading lifecycle.

## Permanent fix

- Memoize `connect` and `disconnect` with React `useCallback`.
- Memoize the connection context value with `useMemo`.
- Remove `config.authToken` from the embedded initialization effect dependency list; the stable `connect` function is sufficient for the one-time iframe session initialization.
- Make `connect()` idempotent: if the requested connection configuration is already active, it returns the existing state object instead of creating another state update.

## Security behavior retained

This change does not weaken embedded authorization. The signed `sie_` token remains authoritative for the canonical project and organization. Project/task/dependency/schedule isolation and organization-scoped resources remain enforced by the server.

## Demo acceptance criteria

1. Embedded PRMS project opens without the loading screen blinking.
2. Tasks remain visible after initial load.
3. Schedule remains rendered while dependencies/resource intelligence load progressively.
4. Resource Orbit can load organization resources.
5. A resource can be assigned to a task in the embedded project.
6. A token for Project A cannot access Project B data.

## Release metadata

- UI/API/Docker release version: `20.2.0`.
- Docker Compose build arguments are aligned to `20.2.0`.
- `VERSION` and `.env.example` are aligned to `20.2.0`.
- API OpenAPI metadata is aligned to `20.2.0`.
