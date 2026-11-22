-- ==============================================================================
-- PIPFLOWTRADE.SITE — PostgreSQL Production Schema (001_initial_schema.sql)
-- Strict UUID keys, foreign keys, UTC timestamps, NUMERIC(18,8) financial math
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Core Users & Profiles
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'LOCKED')),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  email_verification_token_hash TEXT,
  password_reset_token_hash TEXT,
  password_reset_expires_at TIMESTAMPTZ,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  onboarding_step INTEGER NOT NULL DEFAULT 1,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  country TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Roles & Permissions (RBAC)
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'USER')),
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, permission)
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Separate Administrator Accounts & Sessions
CREATE TABLE IF NOT EXISTS administrator_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'SUPPORT')),
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_secret_encrypted TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  last_authenticated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS administrator_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES administrator_accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  mfa_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ip_address TEXT,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Deriv OAuth2 Accounts & Encrypted Tokens (Never exposed to frontend)
CREATE TABLE IF NOT EXISTS connected_deriv_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deriv_login_id TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('DEMO', 'REAL')),
  currency TEXT NOT NULL DEFAULT 'USD',
  reported_balance NUMERIC(18, 8) NOT NULL DEFAULT 0,
  landing_company TEXT,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  connection_status TEXT NOT NULL DEFAULT 'CONNECTED' CHECK (connection_status IN ('CONNECTED', 'DISCONNECTED', 'EXPIRED')),
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, deriv_login_id)
);

CREATE TABLE IF NOT EXISTS encrypted_deriv_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deriv_account_id UUID NOT NULL UNIQUE REFERENCES connected_deriv_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT 'read,trade,trading_information',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Preferences & Shared Risk Engine Settings
CREATE TABLE IF NOT EXISTS account_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  trade_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  risk_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  compact_terminal BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trading_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  default_application TEXT NOT NULL DEFAULT 'trader' CHECK (default_application IN ('bot', 'trader', 'charts', 'options')),
  preferred_mode TEXT NOT NULL DEFAULT 'DEMO' CHECK (preferred_mode IN ('DEMO', 'REAL')),
  default_market TEXT NOT NULL DEFAULT 'R_100',
  real_money_risk_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  risk_acknowledged_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS risk_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  max_stake NUMERIC(18, 8) NOT NULL DEFAULT 25.00000000,
  max_daily_loss NUMERIC(18, 8) NOT NULL DEFAULT 100.00000000,
  max_trades_per_day INTEGER NOT NULL DEFAULT 50,
  stop_loss_limit NUMERIC(18, 8) NOT NULL DEFAULT 50.00000000,
  take_profit_target NUMERIC(18, 8) NOT NULL DEFAULT 250.00000000,
  max_consecutive_losses INTEGER NOT NULL DEFAULT 5,
  max_exposure NUMERIC(18, 8) NOT NULL DEFAULT 200.00000000,
  session_time_limit_minutes INTEGER NOT NULL DEFAULT 240,
  emergency_stop_active BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Application Registry & Cross-Origin SSO Sessions
CREATE TABLE IF NOT EXISTS application_registry (
  id TEXT PRIMARY KEY CHECK (id IN ('bot', 'trader', 'charts', 'options')),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  production_url TEXT NOT NULL,
  hosting_provider TEXT NOT NULL DEFAULT 'Vercel',
  version TEXT NOT NULL DEFAULT '1.0.0',
  sso_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  iframe_compatible BOOLEAN NOT NULL DEFAULT TRUE,
  health_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  last_health_check_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS application_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES application_registry(id) ON DELETE CASCADE,
  sso_code_hash TEXT NOT NULL UNIQUE,
  deriv_account_id UUID REFERENCES connected_deriv_accounts(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  exchanged_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Separate PIPFLOWTRADE Platform Ledger (Strictly distinct from Deriv balances)
CREATE TABLE IF NOT EXISTS platform_ledger_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'FROZEN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, currency)
);

CREATE TABLE IF NOT EXISTS platform_ledger_balances (
  ledger_account_id UUID PRIMARY KEY REFERENCES platform_ledger_accounts(id) ON DELETE CASCADE,
  available_balance NUMERIC(18, 8) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS balance_adjustment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ledger_account_id UUID NOT NULL REFERENCES platform_ledger_accounts(id) ON DELETE CASCADE,
  requested_by_admin_id UUID NOT NULL REFERENCES administrator_accounts(id) ON DELETE RESTRICT,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('CREDIT', 'DEBIT', 'REVERSAL')),
  amount NUMERIC(18, 8) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  reason TEXT NOT NULL,
  reference_entry_id UUID,
  status TEXT NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS balance_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_request_id UUID NOT NULL UNIQUE REFERENCES balance_adjustment_requests(id) ON DELETE CASCADE,
  approved_by_admin_id UUID NOT NULL REFERENCES administrator_accounts(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_account_id UUID NOT NULL REFERENCES platform_ledger_accounts(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  admin_id UUID NOT NULL REFERENCES administrator_accounts(id) ON DELETE RESTRICT,
  adjustment_request_id UUID REFERENCES balance_adjustment_requests(id) ON DELETE RESTRICT,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('CREDIT', 'DEBIT', 'REVERSAL')),
  amount NUMERIC(18, 8) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  previous_balance NUMERIC(18, 8) NOT NULL,
  new_balance NUMERIC(18, 8) NOT NULL,
  reason TEXT NOT NULL,
  reversed_entry_id UUID REFERENCES platform_ledger_entries(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Notifications, Trades, Transactions, Audit Logs, Support & System Settings
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('CONNECTION', 'TRADE', 'SETTLEMENT', 'RISK', 'SECURITY', 'LEDGER', 'ANNOUNCEMENT')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deriv_account_id UUID REFERENCES connected_deriv_accounts(id) ON DELETE SET NULL,
  app_id TEXT NOT NULL REFERENCES application_registry(id),
  deriv_contract_id TEXT,
  symbol TEXT NOT NULL,
  contract_type TEXT NOT NULL,
  stake NUMERIC(18, 8) NOT NULL,
  payout NUMERIC(18, 8),
  profit NUMERIC(18, 8),
  currency TEXT NOT NULL DEFAULT 'USD',
  mode TEXT NOT NULL CHECK (mode IN ('DEMO', 'REAL')),
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'WON', 'LOST', 'SOLD', 'ERROR')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS trading_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID REFERENCES trades(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('DERIV', 'PLATFORM_LEDGER')),
  reference_id TEXT,
  action_type TEXT NOT NULL,
  amount NUMERIC(18, 8) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  balance_after NUMERIC(18, 8),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES administrator_accounts(id) ON DELETE SET NULL,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'GENERAL',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_connected_deriv_user ON connected_deriv_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_application_sessions_user ON application_sessions(user_id, app_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_user ON platform_ledger_entries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id, created_at DESC);
