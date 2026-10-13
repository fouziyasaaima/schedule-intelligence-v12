# Build and deploy

## Local validation
`cd api/orbital-gantt-api`
`docker compose build --no-cache --progress=plain`
`docker compose up -d`
`docker compose ps`

UI: http://localhost:3000
API readiness: http://localhost:4000/ready
Mailpit: http://localhost:8026

The UI uses a same-origin `/api` Next.js rewrite to the Docker `api:4000` service. This is intentional: it makes browser sessions work consistently on localhost and behind a production reverse proxy.

## DigitalOcean
Use the same compose architecture. Create production `.env` values on the server. Keep PostgreSQL private. Expose only the reverse proxy ports (80/443) and SSH as required. Do not expose 5432, 3000, 4000, or Mailpit publicly.
