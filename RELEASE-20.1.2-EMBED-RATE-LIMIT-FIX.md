# Schedule Intelligence 20.1.2 — Embedded Rate-Limit Fix

## Problem
Embedded projects were sharing the normal 240 requests/minute application rate limit. The embedded Gantt uses a short-lived, project-scoped `sie_` token and loads multiple project resources in parallel, so repeated embedded sessions/reloads could exhaust the normal bucket and return `429 RATE_LIMITED` while standalone SI remained usable.

## Fix
- Normal API rate limit remains `240` requests/minute by default.
- Embedded `sie_` sessions receive a separate `1200` requests/minute bucket by default.
- Embedded bearer credentials are SHA-256 hashed before being used as the in-memory rate-limit key; the raw token is not retained by the limiter.
- CORS `OPTIONS` requests and `/health`/`/ready` probes do not consume the application request budget.
- `Retry-After`, `X-RateLimit-Limit`, and `X-RateLimit-Remaining` are returned on rate-limited responses.
- Limits are configurable through `RATE_LIMIT_PER_MINUTE` and `EMBED_RATE_LIMIT_PER_MINUTE`.
- Existing embed project resolution and project-scoped authorization are unchanged.

## Defaults
```env
RATE_LIMIT_PER_MINUTE=240
EMBED_RATE_LIMIT_PER_MINUTE=1200
```

This is a rate-limit isolation fix, not a removal of API protection. Embedded sessions remain short-lived and project-scoped.
