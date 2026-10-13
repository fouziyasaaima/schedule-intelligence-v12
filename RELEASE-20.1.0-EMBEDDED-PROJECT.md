# Schedule Intelligence 20.1.0 — Embedded Project

## Embedded project mode
- Added `/project/?id={PROJECT_ID}&embed=1` project-scoped iframe experience.
- Host applications obtain a short-lived project-scoped embed token from `POST /v1/embed/sessions` using a server-side SI API key.
- Token is passed in the URL fragment, stored only in sessionStorage, and removed from the visible URL after bootstrap.
- Embedded mode hides Connectors, Import, project switching and project administration while retaining Schedule, Network, Resources, Forecast, Impact, Pulse, Intelligence, MAC and Export.
- Backend enforces the project scope for project/task/dependency/resource/assignment/history/scenario/MAC resources.
- Embedded tokens never receive connector scopes.
- Standalone SI login and normal project access remain unchanged.
- `EMBED_TOKEN_SECRET`, `EMBED_APP_URL` and `EMBED_ALLOWED_ORIGINS` are supported environment settings.
