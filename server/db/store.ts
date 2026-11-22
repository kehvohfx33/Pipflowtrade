import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  ApplicationRegistryRecord,
  DatabaseSnapshot,
  PlanRecord,
  SystemSettingRecord,
  WebsiteContentConfig,
} from '../types.ts';
import { hashPassword } from '../security/crypto.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'pipflowtrade.db.json');

function nowIso(): string {
  return new Date().toISOString();
}

export function createDefaultWebsiteContent(ts = nowIso()): WebsiteContentConfig {
  return {
    brandName: 'PIPFLOWTRADE.SITE',
    heroLabel: 'UNIFIED DERIV MULTI-APPLICATION WORKSPACE · SSO ENABLED',
    heroTitle: 'WELCOME TO',
    heroHighlight: 'PIPFLOWTRADE.SITE',
    heroDescription:
      'Your all-in-one workspace for automated analysis, smart bots, MT5-inspired charts and real-time Deriv market insights.',
    primaryCtaLabel: 'START TRADING NOW (DERIV)',
    secondaryCtaLabel: 'EXISTING ACCOUNT LOGIN',
    derivSignupUrl: process.env.DERIV_SIGNUP_URL?.trim() || 'https://deriv.com/signup/',
    derivSignupLabel: 'Sign Up on Deriv',
    liveChartsLabel: 'Live Charts',
    emailSignUpLabel: 'Email Sign Up',
    announcement: {
      enabled: false,
      text: 'Deriv WebSocket v3 live public market stream and independent Vercel SSO routing active.',
      severity: 'INFO',
    },
    maintenanceNotice: {
      enabled: false,
      message: '',
    },
    capabilities: [
      {
        id: 'cap-1',
        title: 'AI-Powered Trading Bots',
        description:
          'Configure strategies, inspect XML logic blocks, and manage automated execution on live Deriv feeds with explicit user authorization.',
        iconKey: 'bot',
        route: '/app/bot',
      },
      {
        id: 'cap-2',
        title: 'Real-Time Market Analysis',
        description:
          'Explore MT5 candlestick charts, multi-timeframe OHLC data, digit distributions, and live Deriv ticks before placing trades.',
        iconKey: 'chart',
        route: '/charts',
      },
      {
        id: 'cap-3',
        title: 'Unified Trading Accounts',
        description:
          'Switch cleanly between your connected Deriv Real and VRTC Demo accounts with strict financial separation and live sync.',
        iconKey: 'wallet',
        route: '/dashboard',
      },
      {
        id: 'cap-4',
        title: 'Risk Management Tools',
        description:
          'Enforce max stake, daily loss limits, max trades per day, consecutive loss protection, and instant Emergency Stop.',
        iconKey: 'shield',
        route: '/account',
      },
      {
        id: 'cap-5',
        title: 'Smart Multi-App SSO',
        description:
          'Authenticate once on PIPFLOWTRADE.SITE and launch Bot Builder, Trader, Smart Charts, and Options via signed 90-second SSO codes.',
        iconKey: 'key',
        route: '/dashboard',
      },
      {
        id: 'cap-6',
        title: 'Full Deriv OAuth2 & API Bridge',
        description:
          'AES-256-GCM encrypted server-side credential vault supporting both modern OAuth2 PKCE and Deriv API token verification.',
        iconKey: 'lock',
        route: '/auth',
      },
      {
        id: 'cap-7',
        title: 'Consolidated Trade & Ledger History',
        description:
          'Track open contracts, Deriv statement settlements, and PIPFLOWTRADE platform ledger events in a unified audit timeline.',
        iconKey: 'history',
        route: '/history',
      },
      {
        id: 'cap-8',
        title: 'Zero-Downtime Vercel Subdomains',
        description:
          'Independent bot, trader, charts, and options applications remain modularly deployed while sharing central governance.',
        iconKey: 'globe',
        route: '/charts',
      },
    ],
    faqs: [
      {
        id: 'faq-1',
        question: 'How does PIPFLOWTRADE.SITE connect to my Deriv account?',
        answer:
          'You sign in via official Deriv OAuth2 or connect an encrypted Deriv API token from app.deriv.com. Credentials are encrypted server-side with AES-256-GCM and never exposed in browser localStorage.',
      },
      {
        id: 'faq-2',
        question: 'Are the four trading apps independent?',
        answer:
          'Yes. Bot Builder, Deriv Trader, Smart Charts, and Options Terminal run independently on dedicated Vercel subdomains and verify single sign-on sessions with this Render backend.',
      },
      {
        id: 'faq-3',
        question: 'What is the difference between my Deriv balance and PIPFLOWTRADE Platform Ledger?',
        answer:
          'Your Deriv Real and VRTC Demo balances come directly from Deriv and are never overwritten internally. The PIPFLOWTRADE Platform Ledger tracks simulated demo credits or administrative ledger adjustments separately.',
      },
      {
        id: 'faq-4',
        question: 'Does PIPFLOWTRADE execute trades without my authorization?',
        answer:
          'No. Every manual order and automated bot strategy requires explicit user authorization and passes server-side risk guards before touching Deriv.',
      },
    ],
    footer: {
      description: 'Unified Deriv API Trading, Automation & Multi-Application Workspace.',
      contactEmail: 'support@pipflowtrade.site',
      supportHours: 'Mon–Fri · 06:00–22:00 UTC',
      copyrightText: `© ${new Date().getFullYear()} PIPFLOWTRADE.SITE. Independent Deriv API Workspace.`,
    },
    seo: {
      title: 'PIPFLOWTRADE.SITE — Unified Deriv Trading Workspace',
      description:
        'Enterprise multi-application Deriv trading platform connecting Bot Builder, Deriv Trader, Smart Charts, and Options Terminal via central SSO.',
      ogTitle: 'PIPFLOWTRADE.SITE — Unified Deriv Trading Workspace',
      ogDescription:
        'Automated analysis, XML bots, MT5-inspired charts, and unified Deriv OAuth2 workspace.',
    },
    updatedAt: ts,
  };
}

export function createDefaultPlans(ts = nowIso()): PlanRecord[] {
  return [
    {
      id: 'plan-starter',
      name: 'Starter Workspace',
      slug: 'starter',
      description: 'Full access to all four independent Deriv apps with standard daily risk limits.',
      priceMonthly: '0.00',
      currency: 'USD',
      allowedApps: ['bot', 'trader', 'charts', 'options'],
      maxDailyTrades: 100,
      maxBots: 5,
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'plan-pro',
      name: 'Pro Trader',
      slug: 'pro',
      description: 'Extended bot strategy slots, priority Deriv telemetry, and higher daily contract caps.',
      priceMonthly: '29.00',
      currency: 'USD',
      allowedApps: ['bot', 'trader', 'charts', 'options'],
      maxDailyTrades: 500,
      maxBots: 25,
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: 'plan-enterprise',
      name: 'Enterprise Desk',
      slug: 'enterprise',
      description: 'Institutional execution quotas, multi-strategy automation, and dedicated support SLA.',
      priceMonthly: '99.00',
      currency: 'USD',
      allowedApps: ['bot', 'trader', 'charts', 'options'],
      maxDailyTrades: 2500,
      maxBots: 100,
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
    },
  ];
}

function createDefaultApps(ts = nowIso()): ApplicationRegistryRecord[] {
  return [
    {
      id: 'bot',
      name: 'Bot Builder',
      subtitle: 'Editable strategies',
      description: 'Automated XML strategy builder with stake controls, risk rules, and emergency stop.',
      productionUrl: process.env.BOT_APP_URL?.trim() || 'https://bot.pipflowtrade.site',
      vercelProjectRef: 'bot-builder',
      vercelDeploymentUrl: process.env.BOT_VERCEL_URL?.trim() || null,
      hostingProvider: 'Vercel',
      version: '1.0.0',
      ssoEnabled: true,
      iframeCompatible: false,
      visibility: 'PUBLIC',
      maintenanceMode: false,
      maintenanceMessage: null,
      planRestrictions: [],
      restrictedUserIds: [],
      healthCheckEnabled: true,
      healthStatus: 'UNKNOWN',
      lastError: null,
      latencyMs: null,
      lastHealthCheckAt: null,
      updatedAt: ts,
    },
    {
      id: 'trader',
      name: 'Deriv Trader',
      subtitle: 'Accumulators & contracts',
      description: 'Multi-contract execution interface with real-time Deriv quotes and position tracking.',
      productionUrl: process.env.TRADER_APP_URL?.trim() || 'https://trader.pipflowtrade.site',
      vercelProjectRef: 'accumulators',
      vercelDeploymentUrl: process.env.TRADER_VERCEL_URL?.trim() || null,
      hostingProvider: 'Vercel',
      version: '1.0.0',
      ssoEnabled: true,
      iframeCompatible: false,
      visibility: 'PUBLIC',
      maintenanceMode: false,
      maintenanceMessage: null,
      planRestrictions: [],
      restrictedUserIds: [],
      healthCheckEnabled: true,
      healthStatus: 'UNKNOWN',
      lastError: null,
      latencyMs: null,
      lastHealthCheckAt: null,
      updatedAt: ts,
    },
    {
      id: 'charts',
      name: 'Smart Charts',
      subtitle: 'MT5 analysis & indicators',
      description: 'Live market charts, timeframes, drawing tools, and multi-asset technical indicators.',
      productionUrl: process.env.CHARTS_APP_URL?.trim() || 'https://charts.pipflowtrade.site',
      vercelProjectRef: 'charts',
      vercelDeploymentUrl: process.env.CHARTS_VERCEL_URL?.trim() || null,
      hostingProvider: 'Vercel',
      version: '1.0.0',
      ssoEnabled: true,
      iframeCompatible: false,
      visibility: 'PUBLIC',
      maintenanceMode: false,
      maintenanceMessage: null,
      planRestrictions: [],
      restrictedUserIds: [],
      healthCheckEnabled: true,
      healthStatus: 'UNKNOWN',
      lastError: null,
      latencyMs: null,
      lastHealthCheckAt: null,
      updatedAt: ts,
    },
    {
      id: 'options',
      name: 'Options Terminal',
      subtitle: 'Digits & options',
      description: 'High-speed options & digits workspace with live proposals, duration controls, and payout metrics.',
      productionUrl: process.env.OPTIONS_APP_URL?.trim() || 'https://options.pipflowtrade.site',
      vercelProjectRef: 'digits',
      vercelDeploymentUrl: process.env.OPTIONS_VERCEL_URL?.trim() || null,
      hostingProvider: 'Vercel',
      version: '1.0.0',
      ssoEnabled: true,
      iframeCompatible: false,
      visibility: 'PUBLIC',
      maintenanceMode: false,
      maintenanceMessage: null,
      planRestrictions: [],
      restrictedUserIds: [],
      healthCheckEnabled: true,
      healthStatus: 'UNKNOWN',
      lastError: null,
      latencyMs: null,
      lastHealthCheckAt: null,
      updatedAt: ts,
    },
  ];
}

function createInitialSnapshot(): DatabaseSnapshot {
  const ts = nowIso();
  const apps = createDefaultApps(ts);

  const systemSettings: SystemSettingRecord[] = [
    {
      key: 'platform_branding',
      value: { name: 'PIPFLOWTRADE.SITE', supportEmail: 'support@pipflowtrade.site' },
      updatedAt: ts,
    },
    {
      key: 'security_policy',
      value: { maxLoginAttempts: 5, lockoutMinutes: 15, sessionTtlHours: 168 },
      updatedAt: ts,
    },
  ];

  return {
    users: [],
    user_profiles: [],
    user_roles: [],
    user_permissions: [],
    user_sessions: [],
    administrator_accounts: [],
    administrator_sessions: [],
    connected_deriv_accounts: [],
    encrypted_deriv_tokens: [],
    account_preferences: [],
    trading_preferences: [],
    risk_settings: [],
    application_registry: apps,
    application_sessions: [],
    platform_ledger_accounts: [],
    platform_ledger_balances: [],
    balance_adjustment_requests: [],
    balance_approvals: [],
    platform_ledger_entries: [],
    notifications: [],
    trades: [],
    trading_history: [],
    transactions: [],
    admin_audit_logs: [],
    support_tickets: [],
    system_settings: systemSettings,
    oauth_states: [],
    plans: createDefaultPlans(ts),
    user_subscriptions: [],
    bot_strategies: [],
    bot_execution_logs: [],
    commission_records: [],
    website_content: createDefaultWebsiteContent(ts),
  };
}

class PersistentStore {
  private data: DatabaseSnapshot;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw) as Partial<DatabaseSnapshot>;
        const defaults = createInitialSnapshot();
        this.data = {
          ...defaults,
          ...parsed,
          plans: parsed.plans && parsed.plans.length > 0 ? parsed.plans : defaults.plans,
          website_content: parsed.website_content
            ? {
                ...defaults.website_content,
                ...parsed.website_content,
                announcement: {
                  ...defaults.website_content.announcement,
                  ...(parsed.website_content.announcement || {}),
                },
                maintenanceNotice: {
                  ...defaults.website_content.maintenanceNotice,
                  ...(parsed.website_content.maintenanceNotice || {}),
                },
                footer: {
                  ...defaults.website_content.footer,
                  ...(parsed.website_content.footer || {}),
                },
                seo: {
                  ...defaults.website_content.seo,
                  ...(parsed.website_content.seo || {}),
                },
              }
            : defaults.website_content,
        };
      } catch (err) {
        console.error('[db] Failed to parse local store, initializing clean snapshot:', err);
        this.data = createInitialSnapshot();
        this.flushSync();
      }
    } else {
      this.data = createInitialSnapshot();
      this.flushSync();
    }

    this.ensureAppRegistryBackfilled();
    this.ensureAppUrlsSynced();
    this.bootstrapAdminFromEnv();
  }

  private ensureAppRegistryBackfilled(): void {
    const defaults = createDefaultApps();
    let changed = false;
    for (const def of defaults) {
      const existing = this.data.application_registry.find((a) => a.id === def.id);
      if (!existing) {
        this.data.application_registry.push(def);
        changed = true;
      } else {
        if (!existing.subtitle) {
          existing.subtitle = def.subtitle;
          changed = true;
        }
        if (!existing.vercelProjectRef) {
          existing.vercelProjectRef = def.vercelProjectRef;
          changed = true;
        }
        if (existing.vercelDeploymentUrl === undefined) {
          existing.vercelDeploymentUrl = def.vercelDeploymentUrl;
          changed = true;
        }
        if (!existing.visibility) {
          existing.visibility = 'PUBLIC';
          changed = true;
        }
        if (existing.maintenanceMode === undefined) {
          existing.maintenanceMode = false;
          changed = true;
        }
        if (existing.maintenanceMessage === undefined) {
          existing.maintenanceMessage = null;
          changed = true;
        }
        if (!Array.isArray(existing.planRestrictions)) {
          existing.planRestrictions = [];
          changed = true;
        }
        if (!Array.isArray(existing.restrictedUserIds)) {
          existing.restrictedUserIds = [];
          changed = true;
        }
        if (existing.healthCheckEnabled === undefined) {
          existing.healthCheckEnabled = true;
          changed = true;
        }
      }
    }
    if (changed) this.flushSync();
  }

  private ensureAppUrlsSynced(): void {
    const envUrls: Record<string, string | undefined> = {
      bot: process.env.BOT_APP_URL,
      trader: process.env.TRADER_APP_URL,
      charts: process.env.CHARTS_APP_URL,
      options: process.env.OPTIONS_APP_URL,
    };
    const envVercelUrls: Record<string, string | undefined> = {
      bot: process.env.BOT_VERCEL_URL,
      trader: process.env.TRADER_VERCEL_URL,
      charts: process.env.CHARTS_VERCEL_URL,
      options: process.env.OPTIONS_VERCEL_URL,
    };
    let changed = false;
    for (const app of this.data.application_registry) {
      const override = envUrls[app.id];
      if (override && override.trim() && app.productionUrl !== override.trim()) {
        app.productionUrl = override.trim();
        app.updatedAt = nowIso();
        changed = true;
      }
      const vercelOverride = envVercelUrls[app.id];
      if (vercelOverride && vercelOverride.trim() && app.vercelDeploymentUrl !== vercelOverride.trim()) {
        app.vercelDeploymentUrl = vercelOverride.trim();
        app.updatedAt = nowIso();
        changed = true;
      }
    }
    if (changed) this.flushSync();
  }

  private bootstrapAdminFromEnv(): void {
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD?.trim();
    if (!adminEmail || !adminPassword) {
      return;
    }

    const existing = this.data.administrator_accounts.find(
      (a) => a.email.toLowerCase() === adminEmail
    );
    if (!existing) {
      const ts = nowIso();
      this.data.administrator_accounts.push({
        id: crypto.randomUUID(),
        userId: null,
        email: adminEmail,
        passwordHash: hashPassword(adminPassword),
        role: 'SUPER_ADMIN',
        mfaEnabled: Boolean(process.env.ADMIN_MFA_SECRET?.trim()),
        mfaSecretEncrypted: null,
        status: 'ACTIVE',
        lastAuthenticatedAt: null,
        createdAt: ts,
        updatedAt: ts,
      });
      this.data.admin_audit_logs.unshift({
        id: crypto.randomUUID(),
        adminId: null,
        adminEmail,
        action: 'BOOTSTRAP_SUPER_ADMIN',
        targetType: 'administrator_accounts',
        targetId: null,
        details: { source: 'server_environment' },
        ipAddress: '127.0.0.1',
        createdAt: ts,
      });
      this.flushSync();
      console.log(`[security] Bootstrapped SUPER_ADMIN account from server environment: ${adminEmail}`);
    }
  }

  private flushSync(): void {
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmpFile, DB_FILE);
  }

  public snapshot(): DatabaseSnapshot {
    return this.data;
  }

  public async transaction<T>(fn: (db: DatabaseSnapshot) => T | Promise<T>): Promise<T> {
    const run = this.writeQueue.then(async () => {
      const backup = JSON.stringify(this.data);
      try {
        const result = await fn(this.data);
        this.flushSync();
        return result;
      } catch (err) {
        this.data = JSON.parse(backup) as DatabaseSnapshot;
        throw err;
      }
    });
    this.writeQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}

export const store = new PersistentStore();

export function addDecimal(a: string | number, b: string | number): string {
  const scaledA = Math.round(Number(a) * 1e8);
  const scaledB = Math.round(Number(b) * 1e8);
  return ((scaledA + scaledB) / 1e8).toFixed(8);
}

export function subtractDecimal(a: string | number, b: string | number): string {
  const scaledA = Math.round(Number(a) * 1e8);
  const scaledB = Math.round(Number(b) * 1e8);
  return ((scaledA - scaledB) / 1e8).toFixed(8);
}

export function formatMoney(val: string | number, decimals = 2): string {
  const n = Number(val);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(decimals);
}
