# Schedule Intelligence v17.4.4 — Compile Fix

Fixes the v17.4.3 API TypeScript build failure in `src/scheduling/recompute.ts`.

`deriveSummaryDates()` is a pure task-array calculation and no longer incorrectly requires a `PrismaClient`, allowing the scheduler to be called with a Prisma transaction client.

No database reset is required.
