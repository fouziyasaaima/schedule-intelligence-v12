# Orbital v10 Enterprise Identity

This release adds organization-owned identities and secure session authentication. Users register a company, become its OWNER, and access the existing scheduling API without exposing an API key to the browser.

## Auth endpoints
- POST /v1/auth/register
- POST /v1/auth/login
- POST /v1/auth/logout
- GET /v1/me

## Security
- Passwords use Node.js scrypt with per-password random salts.
- Sessions are opaque random tokens stored only as SHA-256 hashes and delivered through HttpOnly cookies.
- API endpoints accept either an organization API key or an authenticated session.
- Organization membership is checked before session-based access.
- Audit logs capture authentication and organization creation events.
- API keys remain available for external applications and should be created under Developer/API management.

Production requirements: HTTPS, secure secrets, private PostgreSQL networking, a trusted reverse proxy, real email verification/password reset delivery, MFA/SSO provider integration, and shared rate limiting for multi-instance deployments.
