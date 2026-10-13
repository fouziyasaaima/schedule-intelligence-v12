# Schedule Intelligence 20.1.0 — Database Schema Compatibility Fix

## Problem fixed

Some existing SI databases created by earlier releases can contain the `tasks`
table without the required `project_id` column. The v20 API correctly queries
`Task.projectId`, which maps to SQL `tasks.project_id`, but the old database
schema can therefore fail with PostgreSQL error `42703`.

## Fix

API startup now runs `prisma/schema-preflight.ts` before `prisma db push`.

The preflight:

1. Does nothing when `tasks.project_id` already exists.
2. Migrates a legacy `tasks.projectId` column when that exact legacy column exists.
3. If `tasks.project_id` is missing and exactly one project exists, creates the
   column and assigns existing tasks to that sole project.
4. If multiple projects exist and no deterministic legacy mapping is available,
   startup stops rather than guessing and potentially corrupting project data.
5. Never deletes or recreates the PostgreSQL volume.

After the preflight, Prisma continues with the checked-in schema using the
existing `prisma db push --accept-data-loss` bootstrap strategy.
