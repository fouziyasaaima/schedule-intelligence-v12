#!/bin/sh
set -eu

echo "== Schedule Intelligence API bootstrap =="

# Repair known legacy schema drift before Prisma attempts to enforce the v20 schema.
# This is non-destructive and never drops the PostgreSQL volume.
npx tsx prisma/schema-preflight.ts

# Existing databases may contain duplicate dependency pairs. Normalize them
# before db push attempts to create the unique dependency-pair constraint.
# On a fresh database the table does not exist yet; the script safely skips it.
npx tsx prisma/dedupe-dependencies.ts

# This local distribution has no baseline migration for the core tables.
# Synchronize the checked-in schema so a fresh Docker volume can initialize.
npx prisma db push --accept-data-loss

# PostgreSQL pg_statistic/TOAST corruption can surface as SQLSTATE XX001
# ("missing chunk number") even when the application schema is correct.
# Rebuild planner statistics from the real tables before the API starts.
npx tsx prisma/statistics-preflight.ts

# Run once more after schema creation so fresh databases are also normalized
# and the operation remains safe across repeated container restarts.
npx tsx prisma/dedupe-dependencies.ts

if [ "${DEV_SEED:-false}" = "true" ]; then
  npx tsx prisma/seed.ts
fi

exec node dist/server.js
