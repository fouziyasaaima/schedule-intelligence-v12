# Schedule Intelligence v11.2.2

This release is the Beyond Thinking Gantt stabilization build.

## Local Docker Desktop

1. Go to `api/orbital-gantt-api`.
2. Copy `.env.example` to `.env`.
3. Run `docker compose build --no-cache --progress=plain`.
4. Run `docker compose up -d`.
5. Open `http://localhost:3000`.
6. Local email inbox: `http://localhost:8025`.
7. Test: create company/login → Gantt → dependency drag → Network → recompute → Resources → Monte Carlo → API key → API Docs → password reset.

Local seed credentials:

- Email: `demo@example.com`
- Password: `ChangeMe123!ChangeMe`

## DigitalOcean

1. Copy `PRODUCTION.env.example` to `.env`.
2. Replace every production placeholder with real secrets/domain/SMTP values.
3. Keep `DEV_SEED=false`.
4. Build and start the same Compose stack.
5. Put HTTPS/Nginx/Caddy in front of the UI/API.
6. Do not expose PostgreSQL, Mailpit or the API port publicly.

## Important

Never commit `.env` or production secrets. The application keeps browser sessions on the same-origin `/api` proxy and uses scoped Bearer API keys for external applications.


### v11.4.0 large-data test
The developer seed creates **Large Dataset Lab · 300 Tasks**. Log in with the normal developer seed account, open the seeded project, and exercise Gantt, Network, Pulse, Resource Orbit, Impact and Monte Carlo.
