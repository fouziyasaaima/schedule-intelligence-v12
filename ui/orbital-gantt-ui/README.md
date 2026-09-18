# Schedule Intelligence UI

The browser talks to the API through the same-origin `/api` proxy. This keeps the authenticated HttpOnly session cookie on one origin and avoids loopback-host mismatches during local Docker testing. External applications should call the API directly with scoped Bearer API keys.
