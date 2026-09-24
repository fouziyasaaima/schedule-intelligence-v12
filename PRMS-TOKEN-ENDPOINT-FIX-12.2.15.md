# PRMS Token Endpoint Fix — 12.2.15

The PRMS token endpoint is:

`https://prmscloud.com/api/account/token`

Schedule Intelligence now uses this endpoint as the default in Docker Compose and the production environment example.

The request contract remains:

- Method: POST
- Authorization: `Bearer <PRMS_BEARER_TOKEN>`
- Content-Type: `application/json`
- Body: `{ "ClientId": "<PRMS_CLIENT_ID>", "ClientSecret": "<PRMS_CLIENT_SECRET>" }`
- Expected response field: `accessToken`

Project schedule calls continue to use the access token returned by this exchange.

## Validation

After updating the `.env` used by Docker Compose, rebuild the API so the new environment default is present:

```bash
docker compose down
docker compose build --no-cache api ui
docker compose up -d
```

Then open the PRMS connection, select **Schedule**, and load the project. For Project 10497 the expected result is the PRMS event/action schedule preview, followed by opening the project in the main Schedule Intelligence Gantt.
