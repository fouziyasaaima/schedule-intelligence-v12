# Schedule Intelligence v11.3.5 — Monte Carlo Client Fix

The Monte Carlo panel could crash the Next.js client after a successful forecast.

Root cause: the UI expected `result.finish.forecastOrigin`, but the API response did not
include `forecastOrigin` inside `finish`. The UI then formatted `undefined` as a Date,
causing `RangeError: Invalid time value`.

Changes:
- API now returns `finish.forecastOrigin` as an ISO timestamp.
- UI date formatting safely handles invalid/missing dates.
- v11.3.4 Docker/Prisma bootstrap changes are retained.
- Monte Carlo v11.3.3 deterministic-baseline and forecast-origin logic is retained.
