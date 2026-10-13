# Schedule Intelligence 20.1.0 — Embedded Project Integration

## 1. Configure SI

Set these server-side environment variables:

```env
EMBED_TOKEN_SECRET=replace-with-a-random-secret-at-least-32-characters
EMBED_APP_URL=https://si.example.com
EMBED_ALLOWED_ORIGINS=https://prms.example.com https://mes.example.com
```

`EMBED_TOKEN_SECRET` is never sent to the browser.

## 2. Create an embed session

The host application calls SI server-to-server using an SI API key. The long-lived SI API key must never be placed in browser JavaScript.

```http
POST /api/v1/embed/sessions
Authorization: Bearer YOUR_SI_API_KEY
Content-Type: application/json
```

```json
{
  "projectId": "HOST_PROJECT_ID",
  "projectSource": "prms",
  "ttlSeconds": 900,
  "scopes": [
    "projects:read",
    "projects:write",
    "tasks:read",
    "tasks:write",
    "dependencies:read",
    "dependencies:write",
    "resources:read",
    "resources:write",
    "schedule:read",
    "schedule:write",
    "forecast:read"
  ]
}
```

For PRMS embedding, `projectId` may be the PRMS external project id when `projectSource` is `prms`. SI resolves it through the existing PRMS connector identity mapping. Existing callers may continue to send an SI project id directly.

The response contains:

```json
{
  "projectId": "SI_PROJECT_ID",
  "projectName": "My Project",
  "expiresAt": "2026-10-01T10:00:00.000Z",
  "scopes": ["..."],
  "token": "sie_...",
  "embedUrl": "https://si.example.com/project/?id=SI_PROJECT_ID&embed=1#siEmbedToken=sie_..."
}
```

The embed token is short-lived and restricted to the single project.

## 3. Render the iframe

```html
<iframe
  src="https://si.example.com/project/?id=SI_PROJECT_ID&embed=1#siEmbedToken=sie_..."
  title="Schedule Intelligence"
  style="width:100%;height:900px;border:0"
  allow="clipboard-read; clipboard-write"
></iframe>
```

## 4. Embedded capabilities

Embedded SI keeps the project experience available:

- Schedule
- Network
- Resources
- Forecast
- Impact
- Pulse
- Intelligence
- MAC
- Export

The embedded experience hides:

- Connectors
- Excel/CSV import
- Project switching
- Project administration/delete

The API also enforces these restrictions. Hiding UI controls is not the security boundary.

## 5. Data synchronization

The iframe does not receive PRMS/MES credentials. SI continues to use the connector already configured on the SI server.

```text
PRMS / MES
    |
    | configured connector
    v
Schedule Intelligence
    |
    +-- canonical project/task model
    +-- schedule engine
    +-- resources/dependencies
    +-- MAC
    |
    v
Embedded SI iframe
```

Therefore an embedded PRMS experience can open the same SI project while the connector remains entirely server-side.

## 6. Standalone mode

Normal SI access remains unchanged:

```text
https://si.example.com/
```

Users can log in and use the complete SI application, including Connectors and Import.

A direct project URL without `embed=1` remains a normal authenticated SI experience.

## 7. Token lifecycle

Tokens expire automatically. The browser keeps the token only in `sessionStorage` for the current project session and removes the token from the visible URL fragment after bootstrap.

For a new browser session or an expired token, the host application should request a new embed session.
