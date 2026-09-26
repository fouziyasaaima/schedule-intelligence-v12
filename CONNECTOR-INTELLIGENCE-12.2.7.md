# Schedule Intelligence 12.2.7 — Connector Intelligence

Built from v12.2.6-WORKABLE.

## Universal connector improvements
- API key name is configurable instead of hard-coded to `X-API-Key`.
- API keys can be sent in a header or query parameter, with an optional prefix.
- Bearer authentication supports a configurable header and token prefix.
- Custom secret headers and custom secret query parameters are encrypted with connector credentials.
- Universal REST operations support non-secret per-operation query parameters, headers and JSON body templates.
- Generic collection synchronization now honors page-based or cursor-based pagination configuration (bounded to 100 pages).
- Generic connector Test works against the configured read operation, or the base URL when no read operation has been defined.
- Existing Google/Microsoft OAuth flows remain intact.

## UX
- Universal API creation exposes the common authentication patterns directly.
- Advanced request settings are available only when needed, preserving the simple default flow.

## Compatibility
- No new Prisma tables are required.
- Existing connector records continue to work; legacy API-key records default to `X-API-Key` in the header.
- The v12.2.6 database bootstrap fix is retained.
