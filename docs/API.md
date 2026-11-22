# PIPFLOWTRADE.SITE — Backend API Reference

Base URL (Production): `https://pipflowtrade.site`

## Authentication
- `POST /api/auth/register` — Register user (`fullName`, `email`, `password`, `confirmPassword`, `acceptTerms`, `acceptRiskDisclosure`)
- `POST /api/auth/login` — Email login with attempt lockout & rate limiting
- `POST /api/auth/logout` — Revoke user session and all child SSO application sessions
- `POST /api/auth/forgot-password` — Generate password reset token
- `POST /api/auth/reset-password` — Complete password reset
- `POST /api/auth/verify-email` — Verify email token
- `POST /api/auth/change-password` — Change password (authenticated)
- `GET /api/auth/session` — Fetch current authenticated user, profile, preferences, risk settings, Deriv accounts, and separate Platform Ledger
- `POST /api/auth/onboarding` — Persist onboarding step and defaults

## Deriv OAuth2 & WebSocket API
- `GET /api/deriv/authorize` — Initiate official Deriv OAuth2 redirect
- `GET /api/deriv/callback` — Process Deriv OAuth2 callback, verify token live via Deriv WS, encrypt token at rest
- `POST /api/deriv/connect-token` — Verify & link official Deriv API token directly
- `GET /api/deriv/accounts` — List user's connected Deriv accounts
- `GET /api/deriv/balance` — Sync live authoritative balance from Deriv API
- `POST /api/deriv/select-account` — Switch active Demo/Real Deriv account (Real requires risk acknowledgement)
- `POST /api/deriv/disconnect` — Disconnect Deriv account and purge encrypted token
- `GET /api/deriv/candles` — Public Deriv candlestick history (`symbol`, `granularity`, `count`)
- `GET /api/deriv/ticks/latest` — Latest cached public Deriv ticks
- `POST /api/deriv/trade/execute` — Risk-validated contract proposal & execution via Deriv API

## Applications & SSO
- `GET /api/public/stats` — Genuine database counts & Deriv feed status
- `GET /api/apps` — Registered Vercel applications (`bot`, `trader`, `charts`, `options`)
- `POST /api/apps/:appId/authorize` — Issue short-lived (90s) signed SSO authorization code
- `GET /api/apps/:appId/session` — Standalone Vercel SSO session verification endpoint
- `GET /api/apps/:appId/health` — Live HTTP & frame-ancestors compatibility probe

## User, Risk & Support
- `GET /api/user/profile`, `PATCH /api/user/profile`
- `GET /api/user/balances`
- `GET /api/user/transactions`
- `GET /api/user/notifications`, `POST /api/user/notifications/read`
- `GET /api/user/sessions`, `POST /api/user/sessions/:id/revoke`
- `GET /api/risk/settings`, `PATCH /api/risk/settings`, `POST /api/risk/validate`
- `GET /api/support/tickets`, `POST /api/support/tickets`

## Private Administration (Server-Enforced RBAC + MFA)
- `POST /api/private-admin/authenticate`
- `POST /api/private-admin/logout`
- `GET /api/private-admin/session`
- `GET /api/private-admin/dashboard`
- `GET /api/private-admin/users`, `GET /api/private-admin/users/:id`
- `PATCH /api/private-admin/users/:id/status`, `PATCH /api/private-admin/users/:id/role`
- `GET /api/private-admin/balances`, `POST /api/private-admin/balances/adjust`, `GET /api/private-admin/balances/:userId/history`
- `GET /api/private-admin/audit-logs`
- `GET /api/private-admin/applications`, `PATCH /api/private-admin/applications/:appId`
- `GET /api/private-admin/tickets`, `PATCH /api/private-admin/tickets/:id`
