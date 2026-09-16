# Schedule Intelligence 12.2.13 — Beyond Thinking

This release keeps Schedule Intelligence independent and strengthens the native PRMS boundary.

### PRMS
- Connector UI asks only for Project ID.
- Server-side token exchange: POST `PRMS_TOKEN_URL` with bootstrap Bearer and ClientId/ClientSecret; extracts `accessToken`.
- Native schedule preview reads EventsHierarchy + ActionHierarchybyProject.
- Actual dates are displayed/read-only; expected dates are the writable scheduling layer.
- Project ID is stored as connector configuration, not an environment endpoint.
- Provider-specific configuration is preserved by the API schema.

### Gantt
- Fixed header architecture remains outside the vertical scrollport.
- Actual execution is shown as a subtle secondary track beneath Expected.
- Ongoing actuals extend through today instead of inventing an actual finish.
- Light mode removes legacy dark timeline surfaces and uses neutral grey grid separators.

### Generic connectors
- Existing Google, Microsoft 365, REST/OpenAPI, OAuth, API key, Bearer, Basic and custom-header capabilities remain intact.
- `/api/portfolios` and other arbitrary endpoints should continue to be handled by the generic REST connector; native PRMS uses Project ID and its known schedule contract.
