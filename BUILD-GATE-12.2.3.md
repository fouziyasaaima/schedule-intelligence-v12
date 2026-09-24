# Schedule Intelligence v12.2.4 — Build Gate

This release supersedes the older v12.1.3 Universal Connectors package.

## Important

The API connector service is intentionally typed so `Response.json()` is never consumed as an implicit `unknown`. JSON responses are normalized through `readJsonObject()` before OAuth token fields are read.

If Docker output contains:

`orbital-gantt-api@12.1.2 build`

or the working directory contains `schedule-intelligence-v12.1.3-UNIVERSAL-CONNECTORS`, Docker is building an older package, not this release.

## Expected API build identity

`orbital-gantt-api@12.2.4 build`

## Docker steps

From the extracted v12.2.4 root:

```powershell
docker compose down
docker compose build --no-cache api ui
docker compose up -d
```

Do not copy only `src/connectors/service.ts` into an older release. Use the complete v12.2.4 package so Prisma schema, API routes, UI and connector contracts remain aligned.

## UI prerender hardening

The authentication query-string pages use `useSearchParams()` beneath explicit React Suspense boundaries so `next build` can complete static prerendering under Next.js 15.

Expected API build identity: `orbital-gantt-api@12.2.4 build`
