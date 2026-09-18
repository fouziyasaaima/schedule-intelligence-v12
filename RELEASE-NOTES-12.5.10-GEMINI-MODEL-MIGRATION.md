# Schedule Intelligence v12.5.10 — Gemini Model Migration

- Replaces the retired `gemini-2.5-flash-lite` MAC default with `gemini-3.5-flash-lite`.
- Updates MAC model catalog and pricing metadata to Google’s current published Standard pricing: $0.30 / 1M input tokens and $2.50 / 1M output tokens.
- Automatically migrates an existing persisted `MacSettings.model` value of `gemini-2.5-flash-lite` to the current configured Gemini default, so an old database setting cannot override a corrected `.env`.
- Updates Prisma schema/migration defaults and `.env.example`/Compose defaults.
- Stable external PostgreSQL volume remains `pg_data`.
