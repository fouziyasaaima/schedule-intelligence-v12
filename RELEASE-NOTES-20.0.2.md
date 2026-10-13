# Schedule Intelligence v20.0.2 — PostgreSQL TOAST / Statistics Recovery

## Fix

The previous v20.0.2 schema repair addressed `tasks.project_id`, but the current
runtime error is different: PostgreSQL returns SQLSTATE `XX001` with
`missing chunk number ... in pg_toast_2619` while Prisma reads tasks.

`pg_toast_2619` is the PostgreSQL TOAST storage associated with planner
statistics (`pg_statistic`) on the supported PostgreSQL installation. This can
make a normal Prisma `findMany()` fail even when the application tables and
Prisma schema are correct.

v20.0.2 adds a startup statistics preflight which runs `ANALYZE` on the core SI
tables after schema synchronization. This rebuilds planner statistics from the
actual application data and does not delete or recreate the database volume.

## Important

- No `docker compose down -v` is required.
- No application rows are intentionally deleted.
- The previous `project_id` schema preflight remains included.
- MAC remains optional; this is a core database/runtime repair.
