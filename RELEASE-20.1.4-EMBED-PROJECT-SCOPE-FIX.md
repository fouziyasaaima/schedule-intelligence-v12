# Schedule Intelligence 20.1.4 — Embedded Project Scope Fix

## Problem
Embedded PRMS projects could authenticate successfully but then fail with `EMBED_PROJECT_SCOPE`.

## Fix
- The embedded browser now uses the canonical SI project id carried by the signed embed token for all API calls.
- Embedded API scope validation accepts canonical SI ids and safely resolves PRMS external project ids through the tenant-scoped connector identity mapping.
- URL-encoded project ids are decoded before comparison.
- Task, dependency, resource, assignment, history, AI-run and proposal ownership checks remain tenant-scoped.
- Project-scoped embedded authorization is retained; this is not an authorization bypass.
- Application-level rate limiting remains disabled from v20.1.3.

## Deployment
Rebuild both API and UI images.
