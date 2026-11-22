-- ==============================================================================
-- PIPFLOWTRADE.SITE — Seed Application Registry & Default System Settings
-- ==============================================================================

INSERT INTO application_registry (id, name, description, production_url, hosting_provider, version, sso_enabled, iframe_compatible)
VALUES
  ('bot', 'Bot Builder', 'Editable automated trading strategies and XML block workspace.', 'https://bot.pipflowtrade.site', 'Vercel', '1.0.0', TRUE, TRUE),
  ('trader', 'Deriv Trader', 'Professional multi-contract Deriv trading interface.', 'https://trader.pipflowtrade.site', 'Vercel', '1.0.0', TRUE, TRUE),
  ('charts', 'Smart Charts', 'Live market charts, timeframes, and technical analysis indicators.', 'https://charts.pipflowtrade.site', 'Vercel', '1.0.0', TRUE, TRUE),
  ('options', 'Options Terminal', 'Deriv options interface with live proposals, duration, and payout controls.', 'https://options.pipflowtrade.site', 'Vercel', '1.0.0', TRUE, TRUE)
ON CONFLICT (id) DO UPDATE SET
  production_url = EXCLUDED.production_url,
  description = EXCLUDED.description,
  updated_at = NOW();

INSERT INTO system_settings (key, value)
VALUES
  ('platform_branding', '{"name":"PIPFLOWTRADE.SITE","supportEmail":"support@pipflowtrade.site"}'::jsonb),
  ('security_policy', '{"maxLoginAttempts":5,"lockoutMinutes":15,"sessionTtlHours":168}'::jsonb)
ON CONFLICT (key) DO NOTHING;
