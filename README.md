# PIPFLOWTRADE.SITE — Enterprise Deriv Trading Workspace

Complete multi-application Deriv trading platform unifying **Bot Builder**, **Deriv Trader**, **Smart Charts**, and **Options Terminal** under a central Render identity authority, shared Risk Management Engine, real-time Deriv WebSocket relay, separate Platform Ledger, and hidden Private Administration console.

---

## 1. Domain & Hosting Topology

| Application | Hosting | Production URL | Role |
| :--- | :--- | :--- | :--- |
| Main Platform & Backend | Render | `https://pipflowtrade.site` | Central auth, SSO authority, PostgreSQL, Deriv API, Dashboard, Admin |
| Bot Builder | Vercel | `https://bot.pipflowtrade.site` | Independent Deriv Bot template |
| Deriv Trader | Vercel | `https://trader.pipflowtrade.site` | Independent Deriv Trader template |
| Smart Charts | Vercel | `https://charts.pipflowtrade.site` | Independent Deriv Charts template |
| Options Terminal | Vercel | `https://options.pipflowtrade.site` | Independent Deriv Options template |

---

## 2. Database & PostgreSQL Migrations

Full production PostgreSQL DDL and seed scripts are located in:
- `database/migrations/001_initial_schema.sql` (all 26 tables, UUID keys, foreign keys, indexes, `NUMERIC(18,8)` financial types, UTC timestamps)
- `database/migrations/002_seed_registry.sql` (registers all four Vercel apps and default system settings)
- `server/db/pg-queries.ts` (explicitly typed `$1::uuid`, `$2::text`, `$3::text` bindings eliminating PostgreSQL parameter type ambiguity errors)

---

## 3. Environment Configuration

Copy `.env.example` to `.env` locally or configure in **Render → Environment**:

- `APP_URL`, `FRONTEND_URL`, `BOT_APP_URL`, `TRADER_APP_URL`, `CHARTS_APP_URL`, `OPTIONS_APP_URL`
- `DATABASE_URL` (Render Managed PostgreSQL connection string)
- `DERIV_APP_ID`, `DERIV_CLIENT_SECRET`, `DERIV_OAUTH_REDIRECT_URI` (from `developers.deriv.com`)
- `JWT_SECRET`, `SSO_SIGNING_SECRET`, `TOKEN_ENCRYPTION_KEY` (32+ byte random secrets)
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_MFA_SECRET` (bootstraps the server-side `SUPER_ADMIN` account securely)
- `BREVO_API_KEY` (optional outbound verification & password reset emails)

---

## 4. Render Deployment Instructions

1. Push repository to GitHub and connect via **Render Blueprint** (`render.yaml`) or create a **Web Service**:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
   - **Health Check Path**: `/api/health`
2. Provision **Render PostgreSQL** and run `database/migrations/001_initial_schema.sql` and `002_seed_registry.sql`.
3. Set all environment variables above in Render.
4. Attach custom domain `pipflowtrade.site` in Render and point root `@` DNS records in Namecheap as instructed by Render.

---

## 5. Vercel & Namecheap DNS Instructions

1. Keep the four original Deriv applications deployed as **four separate Vercel projects**:
   - Copy `vercel-integrations/vercel.json` into each project so `Content-Security-Policy: frame-ancestors 'self' https://pipflowtrade.site` permits seamless dashboard embedding.
   - Integrate `vercel-integrations/sso-adapter.ts` into each template boot flow to verify `sso_code` against `GET https://pipflowtrade.site/api/apps/:appId/session`.
2. In **Namecheap Advanced DNS** for `pipflowtrade.site`:
   - **Do NOT modify** existing root `@` records pointing to Render or existing MX/TXT email records.
   - Add the four `CNAME` records exactly as shown in each Vercel project's **Domains** tab:
     - `bot` → `cname.vercel-dns.com` (or project-specific Vercel CNAME target)
     - `trader` → `cname.vercel-dns.com`
     - `charts` → `cname.vercel-dns.com`
     - `options` → `cname.vercel-dns.com`

---

## 6. Security & Private Administration

- **Hidden Admin Entry**: Tapping the main dashboard logo **20 times** (or navigating directly to `/admin`) reveals the administrator login modal. The tap gesture grants **zero privilege**; authentication is enforced strictly server-side against `administrator_accounts` (`scrypt` + optional MFA + `pipflow_admin_sid` HTTP-only cookie).
- **Financial Integrity**: Deriv-reported balances remain authoritative from Deriv APIs and cannot be modified by administrators. Any administrative credits/debits occur strictly inside the separate **PIPFLOWTRADE Platform Ledger** with atomic entries, mandatory reasons, immutable reversals, and full audit logs.

---

## 7. Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.
