# Schedule Intelligence v11.0.0 smoke test

## Local Docker

From `api/orbital-gantt-api`:

```powershell
docker compose down
docker compose build --no-cache --progress=plain
docker compose up -d
docker compose ps
```

Open:
- UI: http://localhost:3000
- Mailpit: http://localhost:8025
- API readiness: http://localhost:4000/ready

## Browser flow

1. Sign in with `demo@example.com` / `ChangeMe123!ChangeMe`.
2. Confirm the schedule loads without a 401 loop.
3. Drag a task and verify the dates persist after refresh.
4. Create a dependency; confirm the Gantt connector animates and Network shows the same edge.
5. Open Resources; add/assign a resource and verify peak workload changes.
6. Open Forecast; run 3,000 or 10,000 simulations.
7. If a cycle exists, Forecast reports the affected task names instead of showing a generic failure.
8. Open Impact and Recovery.
9. Open API Docs.
10. Use the Developer API key from the organization admin flow for an external Bearer request.
11. Test Forgot password and inspect Mailpit for the reset message.

## Production

Create a server-side `.env` from `.env.example`. Set `DEV_SEED=false`, real SMTP, HTTPS `APP_URL`, explicit `CORS_ORIGINS`, a strong database password, and a trusted proxy setting only when the application is actually behind a trusted reverse proxy. Keep PostgreSQL private and expose only the reverse proxy ports.
