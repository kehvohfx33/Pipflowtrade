import WebSocket from 'ws';
import { realtimeHub } from './realtime.ts';

// Deriv's modern public WebSocket endpoint (works reliably from cloud servers & browsers)
const PUBLIC_DERIV_WS_URL = 'wss://api.derivws.com/trading/v1/options/ws/public';
const LEGACY_DERIV_WS_URL = 'wss://ws.derivws.com/websockets/v3';
const DERIV_REST_BASE = 'https://api.derivws.com/trading/v1';

export function getDerivAppId(): string | null {
  const configured =
    process.env.DERIV_APP_ID?.trim() || process.env.VITE_DERIV_APP_ID?.trim();
  return configured && configured.length > 0 ? configured : null;
}

export function getDerivWsEndpoint(): string {
  const raw = process.env.DERIV_WS_URL?.trim();
  const appId = getDerivAppId() || '1089';

  // If user configured modern api.derivws.com endpoint directly, use it
  if (raw && raw.includes('api.derivws.com')) {
    return raw.replace(/^http(s?):\/\//i, 'ws$1://');
  }

  // Build legacy ws.derivws.com endpoint safely without duplicating app_id
  const base = (raw || LEGACY_DERIV_WS_URL).replace(/^http(s?):\/\//i, 'ws$1://');
  try {
    const u = new URL(base);
    if (!u.searchParams.has('app_id')) {
      u.searchParams.set('app_id', appId);
    }
    return u.toString();
  } catch {
    return `${LEGACY_DERIV_WS_URL}?app_id=${encodeURIComponent(appId)}`;
  }
}

export function getPublicMarketWsEndpoints(): string[] {
  const configured = process.env.DERIV_WS_URL?.trim();
  const list = [PUBLIC_DERIV_WS_URL];
  if (configured && configured.includes('api.derivws.com')) {
    list.unshift(configured.replace(/^http(s?):\/\//i, 'ws$1://'));
  }
  return Array.from(new Set(list));
}

interface PendingRequest {
  resolve: (data: any) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

class DerivMarketFeedService {
  private ws: WebSocket | null = null;
  private reqSeq = 1;
  private pending = new Map<number, PendingRequest>();
  private subscribedSymbols = new Set<string>(['R_100', 'R_50', '1HZ100V', 'frxEURUSD']);
  private latestTicks = new Map<string, { quote: number; epoch: number; symbol: string; pip_size?: number }>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  public status: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' = 'DISCONNECTED';
  public lastError: string | null = null;

  public start(): void {
    if (this.ws || this.status === 'CONNECTING') return;
    this.connect();
  }

  private connect(): void {
    this.status = 'CONNECTING';
    realtimeHub.broadcastDerivStatus('CONNECTING');
    const endpoints = getPublicMarketWsEndpoints();
    const url = endpoints[this.reconnectAttempts % endpoints.length];

    try {
      this.ws = new WebSocket(url, { perMessageDeflate: false });
    } catch (err: any) {
      this.status = 'DISCONNECTED';
      this.lastError = err?.message || 'WebSocket initialization failed';
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      this.status = 'CONNECTED';
      this.reconnectAttempts = 0;
      this.lastError = null;
      realtimeHub.broadcastDerivStatus('CONNECTED');
      this.startHeartbeat();
      for (const sym of this.subscribedSymbols) {
        this.sendRaw({ ticks: sym, subscribe: 1 });
      }
    });

    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as any;
        if (msg.req_id && this.pending.has(msg.req_id)) {
          const req = this.pending.get(msg.req_id)!;
          clearTimeout(req.timer);
          this.pending.delete(msg.req_id);
          if (msg.error) {
            req.reject(new Error(msg.error.message || 'Deriv API error'));
          } else {
            req.resolve(msg);
          }
        }

        if (msg.msg_type === 'tick' && msg.tick) {
          const tick = {
            symbol: String(msg.tick.symbol),
            quote: Number(msg.tick.quote),
            epoch: Number(msg.tick.epoch),
            pip_size: Number(msg.tick.pip_size ?? 2),
          };
          this.latestTicks.set(tick.symbol, tick);
          realtimeHub.broadcastTick(tick.symbol, tick);
        }
      } catch {
        // Ignore non-JSON frames
      }
    });

    this.ws.on('unexpected-response', (_req, res) => {
      this.lastError = `Upstream HTTP ${res.statusCode}`;
    });

    this.ws.on('error', (err) => {
      this.lastError = err.message;
    });

    this.ws.on('close', () => {
      this.stopHeartbeat();
      this.ws = null;
      this.status = 'DISCONNECTED';
      realtimeHub.broadcastDerivStatus('DISCONNECTED', this.lastError || 'Feed connection closed');
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error('Deriv market WebSocket disconnected'));
      }
      this.pending.clear();
      this.scheduleReconnect();
    });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendRaw({ ping: 1 });
    }, 25000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(30000, 1500 * Math.pow(2, this.reconnectAttempts));
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private sendRaw(payload: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  public ensureSymbolSubscribed(symbol: string): void {
    if (!this.subscribedSymbols.has(symbol)) {
      this.subscribedSymbols.add(symbol);
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendRaw({ ticks: symbol, subscribe: 1 });
      }
    }
  }

  public getLatestTicks(): Record<string, { quote: number; epoch: number; symbol: string; pip_size?: number }> {
    return Object.fromEntries(this.latestTicks.entries());
  }

  public async request(payload: Record<string, unknown>, timeoutMs = 12000): Promise<any> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const reqId = this.reqSeq++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(reqId);
          reject(new Error('Deriv API request timed out'));
        }, timeoutMs);
        this.pending.set(reqId, { resolve, reject, timer });
        this.sendRaw({ ...payload, req_id: reqId });
      });
    }

    return executePublicDerivCall(payload, timeoutMs);
  }
}

export const derivMarketFeed = new DerivMarketFeedService();

export async function executePublicDerivCall(
  payload: Record<string, unknown>,
  timeoutMs = 12000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(PUBLIC_DERIV_WS_URL, { perMessageDeflate: false });
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // ignore
      }
      fn();
    };
    const timer = setTimeout(() => finish(() => reject(new Error('Deriv public WS timed out'))), timeoutMs);
    ws.on('open', () => {
      ws.send(JSON.stringify({ ...payload, req_id: 1 }));
    });
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as any;
        if (msg.error) return finish(() => reject(new Error(msg.error.message || 'Deriv API error')));
        return finish(() => resolve(msg));
      } catch (err: any) {
        return finish(() => reject(new Error(err?.message || 'Malformed Deriv response')));
      }
    });
    ws.on('error', (err) => finish(() => reject(new Error(err.message || 'Deriv public WS error'))));
  });
}

/**
 * Fetches accounts from Deriv's modern REST API using an OAuth Bearer / API token
 */
export async function fetchDerivAccountsViaRest(accessToken: string): Promise<any[]> {
  const appId = getDerivAppId();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  };
  if (appId) headers['Deriv-App-ID'] = appId;

  const resp = await fetch(`${DERIV_REST_BASE}/options/accounts`, {
    method: 'GET',
    headers,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Deriv accounts API error (${resp.status}): ${text}`);
  }
  const json = (await resp.json()) as any;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.data?.accounts)) return json.data.accounts;
  if (Array.isArray(json?.accounts)) return json.accounts;
  if (Array.isArray(json)) return json;
  return [];
}

/**
 * Generates a short-lived pre-authenticated OTP WebSocket URL via Deriv REST API
 */
export async function getDerivOtpWebSocketUrl(
  accountId: string,
  accessToken: string,
  accountType: 'DEMO' | 'REAL'
): Promise<string> {
  const appId = getDerivAppId();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  };
  if (appId) headers['Deriv-App-ID'] = appId;

  const resp = await fetch(`${DERIV_REST_BASE}/options/accounts/${encodeURIComponent(accountId)}/otp`, {
    method: 'POST',
    headers,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Deriv OTP API error (${resp.status}): ${text}`);
  }
  const json = (await resp.json()) as any;
  if (json?.data?.url) return String(json.data.url);
  if (json?.url) return String(json.url);
  if (json?.websocket_url) return String(json.websocket_url);
  if (json?.data?.websocket_url) return String(json.data.websocket_url);
  const otp = json?.otp || json?.data?.otp;
  if (!otp) throw new Error('Deriv OTP response missing data.url / otp');
  const scopePath = accountType === 'DEMO' ? 'demo' : 'real';
  return `wss://api.derivws.com/trading/v1/options/ws/${scopePath}?otp=${encodeURIComponent(otp)}`;
}

/**
 * Executes an authenticated Deriv WebSocket RPC call.
 * Supports both modern OAuth2/PAT tokens (via REST OTP -> pre-authenticated WS)
 * and legacy Deriv WebSocket tokens (via authorize).
 */
export async function executeEphemeralDerivCall(
  payload: Record<string, unknown>,
  derivToken?: string,
  timeoutMs = 15000,
  accountHint?: { accountId: string; accountType: 'DEMO' | 'REAL'; authMethod?: 'OAUTH_PKCE' | 'LEGACY_WS' }
): Promise<any> {
  if (!derivToken) {
    return executePublicDerivCall(payload, timeoutMs);
  }

  // Try modern OTP flow if requested or if legacy WS fails with 520
  const runViaOtpWs = async (): Promise<any> => {
    if (!accountHint?.accountId) {
      const accounts = await fetchDerivAccountsViaRest(derivToken);
      if (!accounts.length) throw new Error('No Deriv accounts returned for Bearer token');
      const first = accounts[0];
      const accId = String(first.account_id || first.loginid || first.id);
      const isDemo = Boolean(first.account_type === 'demo' || first.is_virtual || accId.startsWith('VRTC'));
      if (payload.authorizeOnly) {
        return {
          authorize: {
            loginid: accId,
            currency: String(first.currency || 'USD'),
            balance: Number(first.balance ?? 0),
            is_virtual: isDemo,
            account_list: accounts.map((a: any) => ({
              loginid: String(a.account_id || a.loginid || a.id),
              currency: String(a.currency || 'USD'),
              is_virtual: Boolean(a.account_type === 'demo' || a.is_virtual || String(a.account_id || a.loginid).startsWith('VRTC')),
              balance: Number(a.balance ?? 0),
            })),
          },
        };
      }
      const otpUrl = await getDerivOtpWebSocketUrl(accId, derivToken, isDemo ? 'DEMO' : 'REAL');
      return runPreAuthedWs(otpUrl, payload, timeoutMs);
    }

    const otpUrl = await getDerivOtpWebSocketUrl(
      accountHint.accountId,
      derivToken,
      accountHint.accountType
    );
    return runPreAuthedWs(otpUrl, payload, timeoutMs);
  };

  if (accountHint?.authMethod === 'OAUTH_PKCE') {
    return runViaOtpWs();
  }

  // Try legacy WebSocket first, and seamlessly fall back to modern REST/OTP if legacy WS returns 520
  try {
    return await runLegacyAuthedWs(getDerivWsEndpoint(), payload, derivToken, timeoutMs);
  } catch (err: any) {
    if (String(err?.message || '').includes('520') || String(err?.message || '').includes('Unexpected server response')) {
      return runViaOtpWs();
    }
    throw err;
  }
}

function runPreAuthedWs(wsUrl: string, payload: Record<string, unknown>, timeoutMs: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // ignore
      }
      fn();
    };
    const timer = setTimeout(() => finish(() => reject(new Error('Deriv OTP WebSocket timed out'))), timeoutMs);
    ws.on('open', () => {
      ws.send(JSON.stringify({ ...payload, req_id: 2 }));
    });
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as any;
        if (msg.error) return finish(() => reject(new Error(msg.error.message || 'Deriv execution failed')));
        return finish(() => resolve(msg));
      } catch (err: any) {
        return finish(() => reject(new Error(err?.message || 'Malformed Deriv response')));
      }
    });
    ws.on('error', (err) => finish(() => reject(new Error(err.message || 'Deriv OTP WS error'))));
  });
}

function runLegacyAuthedWs(
  url: string,
  payload: Record<string, unknown>,
  derivToken: string,
  timeoutMs: number
): Promise<any> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { perMessageDeflate: false });
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // ignore
      }
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error('Deriv WebSocket request timed out')));
    }, timeoutMs);

    ws.on('open', () => {
      ws.send(JSON.stringify({ authorize: derivToken, req_id: 1 }));
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as any;
        if (msg.req_id === 1) {
          if (msg.error) {
            return finish(() => reject(new Error(msg.error.message || 'Deriv authorization failed')));
          }
          if (payload.authorizeOnly) {
            return finish(() => resolve(msg));
          }
          ws.send(JSON.stringify({ ...payload, req_id: 2 }));
          return;
        }

        if (msg.req_id === 2) {
          if (msg.error) {
            return finish(() => reject(new Error(msg.error.message || 'Deriv execution failed')));
          }
          return finish(() => resolve(msg));
        }
      } catch (err: any) {
        finish(() => reject(new Error(err?.message || 'Malformed response from Deriv')));
      }
    });

    ws.on('error', (err) => {
      finish(() => reject(new Error(err.message || 'Deriv WebSocket error')));
    });
  });
}
