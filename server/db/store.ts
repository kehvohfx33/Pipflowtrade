import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  ApplicationRegistryRecord,
  DatabaseSnapshot,
  SystemSettingRecord,
} from '../types.ts';
import { hashPassword } from '../security/crypto.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'pipflowtrade.db.json');

function nowIso(): string {
  return new Date().toISOString();
}

function createInitialSnapshot(): DatabaseSnapshot {
  const ts = nowIso();
  const apps: ApplicationRegistryRecord[] = [
    {
      id: 'bot',
      name: 'Bot Builder',
      description: 'Editable automated trading strategies and visual block XML workspace.',
      productionUrl: process.env.BOT_APP_URL || 'https://bot.pipflowtrade.site',
      hostingProvider: 'Vercel',
      version: '1.0.0',
      ssoEnabled: true,
      iframeCompatible: true,
      healthStatus: 'UNKNOWN',
      lastError: null,
      latencyMs: null,
      lastHealthCheckAt: null,
      updatedAt: ts,
    },
    {
      id: 'trader',
      name: 'Deriv Trader',
      description: 'Professional trading interface with real-time quotes and multi-contract execution.',
      productionUrl: process.env.TRADER_APP_URL || 'https://trader.pipflowtrade.site',
      hostingProvider: 'Vercel',
      version: '1.0.0',
      ssoEnabled: true,
      iframeCompatible: true,
      healthStatus: 'UNKNOWN',
      lastError: null,
      latencyMs: null,
      lastHealthCheckAt: null,
      updatedAt: ts,
    },
    {
      id: 'charts',
      name: 'Smart Charts',
      description: 'Live market charts, timeframes, drawing tools, and technical indicators.',
      productionUrl: process.env.CHARTS_APP_URL || 'https://charts.pipflowtrade.site',
      hostingProvider: 'Vercel',
      version: '1.0.0',
      ssoEnabled: true,
      iframeCompatible: true,
      healthStatus: 'UNKNOWN',
      lastError: null,
      latencyMs: null,
      lastHealthCheckAt: null,
      updatedAt: ts,
    },
    {
      id: 'options',
      name: 'Options Terminal',
      description: 'Deriv options interface with live proposals, duration controls, and payout metrics.',
      productionUrl: process.env.OPTIONS_APP_URL || 'https://options.pipflowtrade.site',
      hostingProvider: 'Vercel',
      version: '1.0.0',
      ssoEnabled: true,
      iframeCompatible: true,
      healthStatus: 'UNKNOWN',
      lastError: null,
      latencyMs: null,
      lastHealthCheckAt: null,
      updatedAt: ts,
    },
  ];

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
        this.data = { ...defaults, ...parsed };
      } catch (err) {
        console.error('[db] Failed to parse local store, initializing clean snapshot:', err);
        this.data = createInitialSnapshot();
        this.flushSync();
      }
    } else {
      this.data = createInitialSnapshot();
      this.flushSync();
    }

    this.ensureAppUrlsSynced();
    this.bootstrapAdminFromEnv();
  }

  private ensureAppUrlsSynced(): void {
    const envUrls: Record<string, string | undefined> = {
      bot: process.env.BOT_APP_URL,
      trader: process.env.TRADER_APP_URL,
      charts: process.env.CHARTS_APP_URL,
      options: process.env.OPTIONS_APP_URL,
    };
    let changed = false;
    for (const app of this.data.application_registry) {
      const override = envUrls[app.id];
      if (override && override.trim() && app.productionUrl !== override.trim()) {
        app.productionUrl = override.trim();
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
