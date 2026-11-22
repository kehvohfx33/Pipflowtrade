import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { store } from '../db/store.ts';
import { getSsoSigningSecret, hashToken } from '../security/crypto.ts';
import { AuthenticatedRequest, requireAuth } from '../middleware/security.ts';
import { derivMarketFeed } from '../services/deriv-ws.ts';
import { AppId } from '../types.ts';

const router = Router();

async function probeApplicationHealth(appUrl: string): Promise<{
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  latencyMs: number;
  iframeCompatible: boolean;
  error: string | null;
}> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(appUrl, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - started;
    const xfo = (resp.headers.get('x-frame-options') || '').toLowerCase();
    const csp = (resp.headers.get('content-security-policy') || '').toLowerCase();

    let iframeCompatible = true;
    if (xfo.includes('deny') || xfo.includes('sameorigin')) {
      iframeCompatible = false;
    }
    if (csp.includes('frame-ancestors')) {
      const match = csp.match(/frame-ancestors\s+([^;]+)/);
      if (match && !match[1].includes('pipflowtrade.site') && !match[1].includes('*')) {
        iframeCompatible = false;
      }
    }

    return {
      status: resp.ok ? 'ONLINE' : 'DEGRADED',
      latencyMs,
      iframeCompatible,
      error: resp.ok ? null : `HTTP ${resp.status}`,
    };
  } catch (err: any) {
    clearTimeout(timer);
    return {
      status: 'OFFLINE',
      latencyMs: Date.now() - started,
      iframeCompatible: false,
      error: err?.name === 'AbortError' ? 'Health probe timed out' : err?.message || 'Upstream unreachable',
    };
  }
}

function getEffectiveUserPlan(userId: string) {
  const db = store.snapshot();
  const sub = db.user_subscriptions.find(
    (s) =>
      s.userId === userId &&
      s.status === 'ACTIVE' &&
      (!s.expiresAt || new Date(s.expiresAt).getTime() > Date.now())
  );
  return (
    (sub ? db.plans.find((p) => p.id === sub.planId) : null) ||
    db.plans.find((p) => p.slug === 'starter') ||
    db.plans[0] ||
    null
  );
}

router.get('/public/content', (_req: Request, res: Response) => {
  const db = store.snapshot();
  const visibleApps = db.application_registry.filter((a) => a.visibility !== 'HIDDEN');
  return res.json({
    content: db.website_content,
    applications: visibleApps,
  });
});

router.get('/public/stats', (_req: Request, res: Response) => {
  const db = store.snapshot();
  const activeAccounts = db.users.filter((u) => u.status === 'ACTIVE').length;
  const connectedDeriv = db.connected_deriv_accounts.filter(
    (d) => d.connectionStatus === 'CONNECTED'
  ).length;
  const executedTrades = db.trades.length;
  const registeredApps = db.application_registry.filter((a) => a.visibility !== 'HIDDEN').length;

  return res.json({
    platformUsers: activeAccounts,
    connectedDerivAccounts: connectedDeriv,
    executedTrades,
    independentApplications: registeredApps,
    derivFeedStatus: derivMarketFeed.status,
    derivOAuthConfigured: Boolean(process.env.DERIV_APP_ID?.trim()),
    timestamp: new Date().toISOString(),
  });
});

router.get(['/apps', '/applications'], (req: AuthenticatedRequest, res: Response) => {
  const db = store.snapshot();
  const plan = req.authUser ? getEffectiveUserPlan(req.authUser.id) : null;
  const apps = db.application_registry
    .filter((a) => a.visibility !== 'HIDDEN')
    .map((app) => {
      const userBlocked = Boolean(
        req.authUser && Array.isArray(app.restrictedUserIds) && app.restrictedUserIds.includes(req.authUser.id)
      );
      const planBlocked = Boolean(plan && !plan.allowedApps.includes(app.id));
      const planRestrictionBlocked = Boolean(
        plan &&
          Array.isArray(app.planRestrictions) &&
          app.planRestrictions.length > 0 &&
          !app.planRestrictions.includes(plan.id)
      );
      return {
        ...app,
        userAccessible: !app.maintenanceMode && !userBlocked && !planBlocked && !planRestrictionBlocked,
        restrictionReason: app.maintenanceMode
          ? app.maintenanceMessage || `${app.name} is undergoing scheduled maintenance.`
          : userBlocked
          ? 'Access restricted by platform administrator.'
          : planBlocked || planRestrictionBlocked
          ? `Requires plan upgrade beyond ${plan?.name || 'current plan'}.`
          : null,
      };
    });
  return res.json({ apps });
});

router.get(['/apps/:appId/health', '/applications/:appId/health'], async (req: Request, res: Response) => {
  const appId = req.params.appId as AppId;
  const app = store.snapshot().application_registry.find((a) => a.id === appId);
  if (!app) {
    return res.status(404).json({ error: 'Unknown application ID.' });
  }

  const targetUrl = app.vercelDeploymentUrl || app.productionUrl;
  const result = await probeApplicationHealth(targetUrl);
  await store.transaction((db) => {
    const target = db.application_registry.find((a) => a.id === appId);
    if (target) {
      target.healthStatus = result.status;
      target.latencyMs = result.latencyMs;
      target.iframeCompatible = result.iframeCompatible;
      target.lastError = result.error;
      target.lastHealthCheckAt = new Date().toISOString();
      target.updatedAt = new Date().toISOString();
    }
  });

  const updated = store.snapshot().application_registry.find((a) => a.id === appId);
  return res.json({ app: updated, probe: result });
});

router.post(['/apps/:appId/authorize', '/applications/:appId/authorize'], requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const appId = req.params.appId as AppId;
    const db = store.snapshot();
    const app = db.application_registry.find((a) => a.id === appId);
    if (!app) {
      return res.status(404).json({ error: 'Application not found in registry.' });
    }
    if (app.visibility === 'HIDDEN') {
      return res.status(403).json({ error: `${app.name} is currently unavailable.` });
    }
    if (app.maintenanceMode) {
      return res.status(503).json({
        error: app.maintenanceMessage || `${app.name} is temporarily in maintenance mode.`,
      });
    }
    if (!app.ssoEnabled) {
      return res.status(403).json({ error: `${app.name} SSO is currently disabled by administrator.` });
    }
    if (Array.isArray(app.restrictedUserIds) && app.restrictedUserIds.includes(req.authUser!.id)) {
      return res.status(403).json({ error: `Your account does not currently have access to ${app.name}.` });
    }

    const plan = getEffectiveUserPlan(req.authUser!.id);
    if (
      plan &&
      (!plan.allowedApps.includes(appId) ||
        (Array.isArray(app.planRestrictions) && app.planRestrictions.length > 0 && !app.planRestrictions.includes(plan.id)))
    ) {
      return res.status(403).json({
        error: `Your current membership plan (${plan.name}) does not include ${app.name}.`,
      });
    }

    const activeAccount =
      db.connected_deriv_accounts.find(
        (d) => d.userId === req.authUser!.id && d.isActive && d.connectionStatus === 'CONNECTED'
      ) ||
      db.connected_deriv_accounts.find(
        (d) => d.userId === req.authUser!.id && d.connectionStatus === 'CONNECTED'
      ) ||
      null;

    const jti = crypto.randomUUID();
    const ssoCode = jwt.sign(
      {
        sub: req.authUser!.id,
        appId,
        derivAccountId: activeAccount?.id || null,
        jti,
      },
      getSsoSigningSecret(),
      { expiresIn: '90s', issuer: 'pipflowtrade.site', audience: app.productionUrl }
    );

    const ts = new Date().toISOString();
    await store.transaction((txDb) => {
      txDb.application_sessions.push({
        id: jti,
        userId: req.authUser!.id,
        appId,
        ssoCodeHash: hashToken(ssoCode),
        derivAccountId: activeAccount?.id || null,
        expiresAt: new Date(Date.now() + 90 * 1000).toISOString(),
        exchangedAt: null,
        revokedAt: null,
        createdAt: ts,
      });
    });

    const targetOrigin = (app.productionUrl || '').trim();
    const launchUrl = new URL(targetOrigin);
    launchUrl.searchParams.set('sso_code', ssoCode);
    launchUrl.searchParams.set('origin', process.env.APP_URL || 'https://pipflowtrade.site');

    let fallbackLaunchUrl: string | null = null;
    if (app.vercelDeploymentUrl && app.vercelDeploymentUrl.trim()) {
      try {
        const alt = new URL(app.vercelDeploymentUrl.trim());
        alt.searchParams.set('sso_code', ssoCode);
        alt.searchParams.set('origin', process.env.APP_URL || 'https://pipflowtrade.site');
        fallbackLaunchUrl = alt.toString();
      } catch {
        fallbackLaunchUrl = null;
      }
    }

    return res.json({
      appId,
      appName: app.name,
      productionUrl: app.productionUrl,
      vercelDeploymentUrl: app.vercelDeploymentUrl || null,
      launchUrl: launchUrl.toString(),
      fallbackLaunchUrl,
      ssoCode,
      expiresInSeconds: 90,
      iframeCompatible: app.iframeCompatible,
      activeDerivAccount: activeAccount
        ? {
            id: activeAccount.id,
            derivLoginId: activeAccount.derivLoginId,
            accountType: activeAccount.accountType,
            currency: activeAccount.currency,
            reportedBalance: activeAccount.reportedBalance,
          }
        : null,
    });
  } catch (err) {
    console.error('[apps/authorize] Error:', err);
    return res.status(500).json({ error: 'Failed to generate application SSO authorization code.' });
  }
});

/**
 * Independent Vercel Application Session Verification Endpoint
 * Vercel apps (bot/trader/charts/options) exchange sso_code or Bearer token here
 * to verify user identity, active Deriv mode, and shared risk limits.
 */
router.get(['/apps/:appId/session', '/applications/:appId/session'], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const appId = req.params.appId as AppId;
    const db = store.snapshot();
    const app = db.application_registry.find((a) => a.id === appId);
    if (!app) {
      return res.status(404).json({ error: 'Unknown application.' });
    }
    if (app.maintenanceMode) {
      return res.status(503).json({
        valid: false,
        error: app.maintenanceMessage || `${app.name} is currently under maintenance.`,
      });
    }

    const ssoCode =
      typeof req.query.sso_code === 'string'
        ? req.query.sso_code
        : req.headers.authorization?.replace(/^Bearer\s+/i, '');

    let userId: string | null = req.authUser?.id || null;
    let derivAccountId: string | null = null;

    if (ssoCode) {
      let decoded: any;
      try {
        decoded = jwt.verify(ssoCode, getSsoSigningSecret(), {
          issuer: 'pipflowtrade.site',
        });
      } catch {
        return res.status(401).json({ valid: false, error: 'SSO authorization code expired or invalid.' });
      }

      if (decoded.appId !== appId) {
        return res.status(403).json({ valid: false, error: 'SSO code is not authorized for this application.' });
      }

      const sess = db.application_sessions.find((s) => s.id === decoded.jti);
      if (!sess || sess.revokedAt || new Date(sess.expiresAt).getTime() < Date.now()) {
        return res.status(401).json({ valid: false, error: 'Application session revoked or expired.' });
      }

      userId = decoded.sub;
      derivAccountId = decoded.derivAccountId || null;

      await store.transaction((txDb) => {
        const target = txDb.application_sessions.find((s) => s.id === sess.id);
        if (target && !target.exchangedAt) {
          target.exchangedAt = new Date().toISOString();
        }
      });
    }

    if (!userId) {
      return res.status(401).json({ valid: false, error: 'No authenticated PIPFLOWTRADE session.' });
    }

    const user = db.users.find((u) => u.id === userId && u.status === 'ACTIVE');
    if (!user) {
      return res.status(403).json({ valid: false, error: 'User account is unavailable or suspended.' });
    }

    if (Array.isArray(app.restrictedUserIds) && app.restrictedUserIds.includes(userId)) {
      return res.status(403).json({ valid: false, error: 'Access restricted for this user.' });
    }

    const profile = db.user_profiles.find((p) => p.userId === userId);
    const riskSettings = db.risk_settings.find((r) => r.userId === userId);
    const activeAccount =
      (derivAccountId
        ? db.connected_deriv_accounts.find((d) => d.id === derivAccountId && d.userId === userId)
        : null) ||
      db.connected_deriv_accounts.find(
        (d) => d.userId === userId && d.isActive && d.connectionStatus === 'CONNECTED'
      ) ||
      null;

    return res.json({
      valid: true,
      appId,
      user: {
        id: user.id,
        email: user.email,
        fullName: profile?.fullName || user.email,
      },
      activeDerivAccount: activeAccount
        ? {
            id: activeAccount.id,
            derivLoginId: activeAccount.derivLoginId,
            accountType: activeAccount.accountType,
            currency: activeAccount.currency,
            reportedBalance: activeAccount.reportedBalance,
          }
        : null,
      riskSettings,
    });
  } catch (err) {
    console.error('[apps/session] Error:', err);
    return res.status(500).json({ valid: false, error: 'Failed to verify application SSO session.' });
  }
});

export default router;
