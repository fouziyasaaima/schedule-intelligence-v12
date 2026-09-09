#!/bin/sh
set -eu

echo "== Schedule Intelligence API bootstrap =="
# Normalize legacy duplicate dependency pairs before enforcing the one-edge-per-pair invariant.
npx tsx prisma/dedupe-dependencies.ts
# This local distribution has no baseline migration for the core tables.
# Synchronize the checked-in schema so a fresh Docker volume can initialize.
npx prisma db push --accept-data-loss

if [ "${DEV_SEED:-false}" = "true" ]; then
  npx tsx prisma/seed.ts
fi

exec node dist/server.js
