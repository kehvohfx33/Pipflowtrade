/**
 * PIPFLOWTRADE.SITE — Vercel Standalone Application SSO Handshake Adapter
 * -----------------------------------------------------------------------------
 * Drop this module into each of the four independent Vercel projects:
 *   - bot.pipflowtrade.site
 *   - trader.pipflowtrade.site
 *   - charts.pipflowtrade.site
 *   - options.pipflowtrade.site
 *
 * Ensures no user can bypass central authentication by opening a Vercel URL
 * directly: validates `sso_code` (or active Render cookie) against
 * https://pipflowtrade.site/api/apps/:appId/session.
 */

export type PipflowAppId = 'bot' | 'trader' | 'charts' | 'options';

export interface VerifiedSsoSession {
  valid: boolean;
  appId: PipflowAppId;
  user: {
    id: string;
    email: string;
    fullName: string;
  };
  activeDerivAccount: {
    id: string;
    derivLoginId: string;
    accountType: 'DEMO' | 'REAL';
    currency: string;
    reportedBalance: string;
  } | null;
  riskSettings: {
    maxStake: string;
    maxDailyLoss: string;
    emergencyStopActive: boolean;
  } | null;
}

const MAIN_AUTHORITY_URL = 'https://pipflowtrade.site';

export async function verifyPipflowSsoSession(appId: PipflowAppId): Promise<VerifiedSsoSession> {
  const url = new URL(window.location.href);
  const ssoCode = url.searchParams.get('sso_code');

  if (ssoCode) {
    sessionStorage.setItem(`pipflow_sso_${appId}`, ssoCode);
    url.searchParams.delete('sso_code');
    window.history.replaceState({}, '', url.toString());
  }

  const storedCode = ssoCode || sessionStorage.getItem(`pipflow_sso_${appId}`);
  const endpoint = new URL(`${MAIN_AUTHORITY_URL}/api/apps/${appId}/session`);
  if (storedCode) {
    endpoint.searchParams.set('sso_code', storedCode);
  }

  const resp = await fetch(endpoint.toString(), {
    method: 'GET',
    credentials: 'include',
  });

  if (!resp.ok) {
    sessionStorage.removeItem(`pipflow_sso_${appId}`);
    window.location.href = `${MAIN_AUTHORITY_URL}/#/auth?return_app=${appId}`;
    throw new Error('PIPFLOWTRADE SSO authentication required');
  }

  const data = (await resp.json()) as VerifiedSsoSession;
  if (!data.valid) {
    window.location.href = `${MAIN_AUTHORITY_URL}/#/auth?return_app=${appId}`;
    throw new Error('Invalid PIPFLOWTRADE SSO session');
  }

  return data;
}
