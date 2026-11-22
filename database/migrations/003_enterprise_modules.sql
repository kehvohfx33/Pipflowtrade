-- ==============================================================================
-- PIPFLOWTRADE.SITE — Enterprise Modules Schema (003_enterprise_modules.sql)
-- Adds plans, subscriptions, bot management, commissions, CMS & app deployment fields
-- ==============================================================================

ALTER TABLE application_registry
  ADD COLUMN IF NOT EXISTS subtitle TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS vercel_project_ref TEXT,
  ADD COLUMN IF NOT EXISTS vercel_deployment_url TEXT,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS maintenance_message TEXT,
  ADD COLUMN IF NOT EXISTS plan_restrictions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS restricted_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS health_check_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  price_monthly NUMERIC(18, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  allowed_apps JSONB NOT NULL DEFAULT '["bot","trader","charts","options"]'::jsonb,
  max_daily_trades INTEGER NOT NULL DEFAULT 100,
  max_bots INTEGER NOT NULL DEFAULT 5,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'CANCELLED')),
  expires_at TIMESTAMPTZ,
  assigned_by_admin_id UUID REFERENCES administrator_accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bot_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  strategy_type TEXT NOT NULL DEFAULT 'XML_BLOCKLY',
  symbol TEXT NOT NULL DEFAULT 'R_100',
  xml_content TEXT NOT NULL,
  connected_account_id UUID REFERENCES connected_deriv_accounts(id) ON DELETE SET NULL,
  environment TEXT NOT NULL DEFAULT 'DEMO' CHECK (environment IN ('DEMO', 'REAL')),
  status TEXT NOT NULL DEFAULT 'IDLE' CHECK (status IN ('IDLE', 'RUNNING', 'SUSPENDED', 'STOPPED')),
  stake NUMERIC(18, 8) NOT NULL DEFAULT 1.00000000,
  user_authorized_execution BOOLEAN NOT NULL DEFAULT FALSE,
  last_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bot_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID NOT NULL REFERENCES bot_strategies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'INFO' CHECK (level IN ('INFO', 'WARN', 'ERROR')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commission_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  app_id TEXT NOT NULL REFERENCES application_registry(id),
  trade_id UUID REFERENCES trades(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('ESTIMATED', 'CONFIRMED', 'PARTNER_REPORT')),
  amount NUMERIC(18, 8) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'RECONCILED')),
  period_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS website_content (
  key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_bot_strategies_user ON bot_strategies(user_id);
CREATE INDEX IF NOT EXISTS idx_commission_records_date ON commission_records(period_date DESC);
