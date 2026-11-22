# PIPFLOWTRADE.SITE — Security & Privacy Architecture

1. **Password Security**: All user and administrator passwords are hashed using Node.js `crypto.scryptSync` with 16-byte random salts and verified with `crypto.timingSafeEqual`.
2. **Deriv Token Encryption**: Authorized Deriv OAuth2 and API tokens are encrypted at rest with **AES-256-GCM** using `TOKEN_ENCRYPTION_KEY`, random 12-byte IVs, and authentication tags. Deriv tokens are never returned to client JavaScript, never placed in URLs, and never logged.
3. **Session & Cookie Policy**:
   - Standard user sessions use `pipflow_sid` (`HttpOnly`, `SameSite=Lax`, `Secure` in production).
   - Administrator sessions use a completely separate `pipflow_admin_sid` cookie.
   - Mutating `/api/*` requests verify the `X-CSRF-Token` header against the `pipflow_csrf` cookie.
4. **Cross-Origin Single Sign-On (SSO)**:
   - Does not rely on cross-origin cookies inside iframes.
   - Main Render backend issues a 90-second single-use JWT `sso_code` bound to `(userId, appId, derivAccountId)` and persisted in `application_sessions`.
   - Independent Vercel apps verify the code server-side/via authenticated fetch at `/api/apps/:appId/session`.
5. **Hidden Admin Entry Control**:
   - Normal users cannot see any admin entry point.
   - Tapping the main dashboard logo 20 times **only** opens the authentication modal and confers zero privilege.
   - Admin access requires valid `administrator_accounts` credentials, optional `ADMIN_MFA_SECRET` verification, and server-side RBAC middleware (`SUPER_ADMIN`, `ADMIN`, `SUPPORT`).
   - Super Admin provisioning occurs exclusively via server-side environment configuration (`ADMIN_EMAIL` + `ADMIN_PASSWORD`), never from registration emails.
6. **Financial Integrity**:
   - Deriv-reported balances are authoritative and read-only.
   - Platform Ledger adjustments execute atomically, record previous/new balances and reasons, support non-destructive reversals, and emit immutable audit logs.
