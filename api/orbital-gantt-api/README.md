# Schedule Intelligence API — BEYOND v4

API-first scheduling service for Schedule Intelligence.

## Added in v4
- Monte Carlo project finish forecasting: `POST /v1/projects/:id/simulations/monte-carlo`
- P50/P80/P90 finish dates and distribution histogram.
- Resource workload/assignment contract remains independent of chat/CRM.
- CORS supports localhost:3000 and localhost:3001 by default.

## Run
`npm install`, configure `DATABASE_URL`, `API_KEY_SALT` and `CORS_ORIGINS`, then `npm run prisma:generate`, `npm run prisma:migrate`, `npm run dev`.

## Public API documentation

- Interactive reference: `GET /docs`
- OpenAPI 3 document: `GET /openapi.json`
- Authentication: `Authorization: Bearer <API_KEY>`
- Tenant isolation: every resource query is constrained by the API key's organization.
- Keys are stored as SHA-256 hashes and can be revoked.
- Production guidance: HTTPS, restricted CORS, server-side key storage, key rotation, and least-privilege scopes.

### Intelligence endpoints

- `POST /v1/projects/:id/simulations/monte-carlo` — probabilistic finish forecast.
- `POST /v1/projects/:id/scenarios/impact` — non-mutating what-if schedule impact preview.
