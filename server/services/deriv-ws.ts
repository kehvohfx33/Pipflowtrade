import WebSocket from 'ws';
import { realtimeHub } from './realtime.ts';

const DEFAULT_DERIV_WS_URL = 'wss://ws.derivws.com/websockets/v3';
// Deriv official public read-only market app_id is 1089 if DERIV_APP_ID is not yet provided for public ticks
const PUBLIC_MARKET_APP_ID = '1089';

export function getDerivAppId(): string | null {
  const configured = process.env.DERIV_APP_ID?.trim();
  return configured && configured.length > 0 ? configured : null;
}

export function getDerivWsEndpoint(): string {
  const base = process.env.DERIV_WS_URL?.trim() || DEFAULT_DERIV_WS_URL;
  const appId = getDerivAppId() || PUBLIC_MARKET_APP_ID;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}app_id=${encodeURIComponent(appId)}`;
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
    const url = getDerivWsEndpoint();

    try {
      this.ws = new WebSocket(url, {
        headers: {
          Origin: process.env.APP_URL || 'https://pipflowtrade.site',
        },
      });
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
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return executeEphemeralDerivCall(payload, undefined, timeoutMs);
    }
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
}

export const derivMarketFeed = new DerivMarketFeedService();

/**
 * Executes an isolated, authenticated or public Deriv WebSocket RPC call
 * using the user's decrypted Deriv OAuth token (strictly server-side).
 */
export async function executeEphemeralDerivCall(
  payload: Record<string, unknown>,
  derivToken?: string,
  timeoutMs = 15000
): Promise<any> {
  const url = getDerivWsEndpoint();
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
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
      if (derivToken) {
        ws.send(JSON.stringify({ authorize: derivToken, req_id: 1 }));
      } else {
        ws.send(JSON.stringify({ ...payload, req_id: 2 }));
      }
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
