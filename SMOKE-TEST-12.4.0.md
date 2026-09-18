# 12.4.0 Smoke Test

1. Copy `.env.example` values into `.env` and set the PRMS credentials plus `GEMINI_API_KEY`.
2. Build with Docker:
   `docker compose down && docker compose build --no-cache api ui && docker compose up -d`
3. Confirm `/health` and `/ready` report `12.4.0`.
4. Open Connector Studio → PRMS → Schedule.
5. Confirm Project 10497 loads and shows events/actions.
6. Click **Open in Gantt**.
7. Confirm a PRMS project appears in the top Gantt project selector.
8. Confirm expected bars and actual secondary bars are visible.
9. Edit an expected date and confirm PRMS write-back succeeds; if it fails, confirm the local change is rolled back.
10. Wait for or manually invoke a connector sync and inspect Synchronization history.
11. Open MAC. Confirm the panel opens without spending an AI request.
12. Open MAC Studio. Confirm Gemini 2.5 Flash-Lite is selected and budget values are visible.
13. Ask MAC one question. Confirm one usage record is created.
14. Repeat the identical question within 15 minutes. Confirm cache behavior and no new model charge.
15. Set a very small request/monthly budget and confirm MAC blocks a request rather than exceeding it.
16. Confirm autonomous MAC watch is OFF by default.
