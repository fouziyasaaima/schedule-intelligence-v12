# Schedule Intelligence v10.3.3 — Login Fix

The local seed account previously allowed a short `SEED_USER_PASSWORD` while the login API correctly requires at least 12 characters. This caused HTTP 400 validation errors when using the seeded credentials.

Fixes:
- Local `.env` now uses `ChangeMe123!ChangeMe`.
- Seed validates `SEED_USER_PASSWORD` length.
- Seed updates the existing demo user's password hash on every DEV_SEED run, so changing the env password actually takes effect.
- Existing users are marked email-verified by the development seed.
- API version updated to 10.3.3.

Local demo:
Email: info@saftdatasolutions.com
Password: ChangeMe123!ChangeMe

For a clean local test:
1. `docker compose down`
2. `docker compose up -d --build`
3. If the database already contains the old seeded user, `DEV_SEED=true` will update its password on startup.
4. Open http://localhost:3000 and sign in.

The 401 request to `/v1/me` before login is normal: it means no session exists yet. The 400 from `/v1/auth/login` was the validation failure.
