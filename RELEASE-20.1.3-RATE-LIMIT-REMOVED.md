# Schedule Intelligence 20.1.3 — Application Rate Limit Removed

## Change
The in-process application rate limiter has been completely removed from the API.

This fixes embedded projects being rejected with `429 RATE_LIMITED` during normal Gantt loading. Standalone and embedded traffic now use the same API without an application-level request counter.

## Security
Authentication, project-scoped embed tokens, scopes, expiration, CORS, security headers, and existing authorization remain enabled.

For production throttling, use a trusted reverse proxy/API gateway rather than an in-process limiter.
