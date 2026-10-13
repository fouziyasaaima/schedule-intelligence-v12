# Schedule Intelligence 20.1.9 — Embedded Project Authority Fix

## Purpose
Fix persistent `EMBED_PROJECT_SCOPE` failures in embedded PRMS sessions when the browser or a module sends a host/external project reference instead of the canonical SI project id contained in the signed `sie_` token.

## Changes
- The signed embed token remains the sole authority for the embedded project.
- All `/v1/projects/:id/*` and `/api/v1/projects/:id/*` embedded requests are canonicalized to the signed SI project before route handlers execute.
- The embedded browser API client also canonicalizes every project-scoped request to `config.embedProjectId`.
- PRMS/external ids are therefore never allowed to become the project identity used by SI route handlers.
- Cross-project object access remains blocked: tasks, dependencies, assignments, resources, history snapshots, AI schedule runs and proposals are checked against the signed token project.
- Resource ownership now recognizes both `project_resources` and task assignments, avoiding false project-scope failures for project-linked resources without current assignments.
- Full functional embedded scopes remain independent of the parent API key: projects, tasks, dependencies, resources, schedule and forecast read/write scopes.
- Connector/admin scopes remain excluded from the browser token.
- API-key rate limiting remains disabled as in prior embedded releases.
- Version bumped to 20.1.9.

## Security model
A token for Project A can never read or mutate Project B. If an embedded request contains another project identifier, the server uses the signed token project as the canonical project context. Object-level requests are still rejected when the object belongs to another project.
