# Docker / Prisma Bootstrap Integrity — v11.3.4

## Problem fixed

The API container could enter a restart loop on an existing local PostgreSQL volume when Prisma detected the dependency-pair unique constraint and refused `prisma db push` without explicit data-loss acknowledgement.

## Fix

The Docker entrypoint now performs these steps in order:

1. Run `prisma/dedupe-dependencies.ts` to normalize legacy duplicate predecessor → successor pairs.
2. Run `prisma db push --accept-data-loss` so Prisma can apply the checked-in schema to the local Docker database.
3. Optionally seed only when `DEV_SEED=true`.
4. Start the API server.

The deduplication step runs before schema synchronization, so the dependency-pair uniqueness invariant is established before Prisma creates the unique constraint.

## Data-preservation intent

This release does **not** require removal of the PostgreSQL Docker volume. Existing local project/task/dependency data remains in `orbital-gantt-api_pgdata`.

`--accept-data-loss` is used here because this development distribution bootstraps its schema with `prisma db push` rather than a baseline migration. The dependency-pair normalization runs immediately before the schema synchronization.

## Production deployment

Production should use versioned Prisma migrations and `prisma migrate deploy`, not `db push --accept-data-loss`. The local bootstrap approach is intentionally retained for the standalone Docker development package.
