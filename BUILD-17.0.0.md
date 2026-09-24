# Build 17.0.0

1. Extract the release directory.
2. Review `.env` / `.env.example` and PRMS credentials.
3. Ensure Docker Desktop is running.
4. Run `docker compose up -d --build`.
5. Open the configured UI port (default 3010).
6. Open Connectors -> Import Excel / CSV.
7. Download `SI-Standard-Schedule-v1.0.xlsx`, edit it, then import it.
8. Verify the schedule, resources and dependencies in SI before using PRMS Publish.

The API bootstrap uses Prisma `db push`; the new custom-field columns are created automatically on the existing local database according to the checked-in schema.
