# Schedule Intelligence v20.0.2 — Schema Compatibility Fix

This is a corrective release for existing PostgreSQL databases where the `tasks` table is missing `project_id`.

### Included
- Preflight schema compatibility check before Prisma schema synchronization.
- Safe migration of legacy `tasks.projectId` to `tasks.project_id` when present.
- Deterministic backfill only when exactly one project exists.
- Safe refusal to guess when multiple projects exist without a mapping.
- No PostgreSQL volume deletion or database reset.
- UI/API version aligned to 20.0.2.

### Deployment
Build and recreate the API container so the new entrypoint runs:

```bash
docker compose build api
docker compose up -d --force-recreate api
docker compose logs -f api
```

If the database contains multiple projects and the required task/project mapping is genuinely absent, the API will stop with a clear schema-preflight message rather than assigning tasks to the wrong project.
