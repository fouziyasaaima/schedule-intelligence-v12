#!/bin/sh
set -eu

echo "== Schedule Intelligence API bootstrap =="

# Existing databases may contain duplicate dependency pairs. Normalize them
# before db push attempts to create the unique dependency-pair constraint.
# On a fresh database the table does not exist yet; the script safely skips it.
npx tsx prisma/dedupe-dependencies.ts

# This local distribution has no baseline migration for the core tables.
# Synchronize the checked-in schema so a fresh Docker volume can initialize.
npx prisma db push --accept-data-loss

# Run once more after schema creation so fresh databases are also normalized
# and the operation remains safe across repeated container restarts.
npx tsx prisma/dedupe-dependencies.ts

if [ "${DEV_SEED:-false}" = "true" ]; then
  npx tsx prisma/seed.ts
fi

exec node dist/server.js
