# Schedule Intelligence Enterprise Email Templates

Server-rendered responsive templates are included for:
- Email verification
- Password reset
- Organization invitation
- Welcome onboarding
- Security alert

All transactional messages use a consistent enterprise layout, clear CTA, expiry language, plain-text fallback, minimal sensitive data, and server-side SMTP credentials. Configure SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, APP_URL and EMAIL_BRAND_NAME.


## Registration & password security flow (v11.2.3)

- **Company registration:** sends a dedicated registration-confirmation email containing a one-time verification link valid for 24 hours.
- **Email verification:** the link activates the account and starts a secure session; the welcome email is sent only after successful verification.
- **Resend verification:** generates a fresh one-time verification link and invalidates outstanding unused verification tokens.
- **Forgot password:** sends a one-time reset link valid for 1 hour; successful reset invalidates existing sessions.
- **Email failure handling:** production registration preserves the newly created account and secure pending session so the user can retry/resend instead of creating duplicate company records.
- **Gmail / Google Workspace:** use `smtp.gmail.com`, port `587`, `SMTP_SECURE=false`, and a Google App Password.
- **Branding:** set `EMAIL_BRAND_NAME`, `SMTP_FROM`, and optionally `SMTP_REPLY_TO`.
