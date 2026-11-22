import { IncomingMessage } from 'http';
import { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { hashToken } from '../security/crypto.ts';
import { store } from '../db/store.ts';

interface ClientMeta {
  ws: WebSocket;
  userId: string | null;
  adminId: string | null;
  subscribedSymbols: Set<string>;
}

class RealtimeHub {
  private wss: WebSocketServer | null = null;
  private clients = new Set<ClientMeta>();
  private onSymbolSubscribe?: (symbol: string) => void;

  public attach(server: HttpServer, onSymbolSubscribe?: (symbol: string) => void): void {
    this.onSymbolSubscribe = onSymbolSubscribe;
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url || '/', 'http://localhost');
      if (url.pathname !== '/ws') {
        return; // Let Vite or other upgrade handlers run if not /ws
      }

      this.wss?.handleUpgrade(req, socket, head, (ws) => {
        this.wss?.emit('connection', ws, req);
      });
    });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const { userId, adminId } = this.authenticateUpgrade(req);
      const meta: ClientMeta = {
        ws,
        userId,
        adminId,
        subscribedSymbols: new Set(['R_100']),
      };
      this.clients.add(meta);
      this.onSymbolSubscribe?.('R_100');

      ws.send(
        JSON.stringify({
          type: 'connection:ready',
          authenticated: Boolean(userId),
          adminAuthenticated: Boolean(adminId),
          timestamp: new Date().toISOString(),
        })
      );

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as { type?: string; symbol?: string };
          if (msg.type === 'market:subscribe' && msg.symbol && /^[A-Za-z0-9_]+$/.test(msg.symbol)) {
            meta.subscribedSymbols.add(msg.symbol);
            this.onSymbolSubscribe?.(msg.symbol);
          } else if (msg.type === 'market:unsubscribe' && msg.symbol) {
            meta.subscribedSymbols.delete(msg.symbol);
          } else if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          }
        } catch {
          // Ignore malformed client payloads
        }
      });

      ws.on('close', () => {
        this.clients.delete(meta);
      });
    });
  }

  private authenticateUpgrade(req: IncomingMessage): { userId: string | null; adminId: string | null } {
    const rawCookie = req.headers.cookie || '';
    const cookies: Record<string, string> = {};
    for (const part of rawCookie.split(';')) {
      const idx = part.indexOf('=');
      if (idx > -1) {
        const k = part.slice(0, idx).trim();
        const v = decodeURIComponent(part.slice(idx + 1).trim());
        cookies[k] = v;
      }
    }

    const db = store.snapshot();
    const now = Date.now();
    let userId: string | null = null;
    let adminId: string | null = null;

    if (cookies.pipflow_sid) {
      const tokenHash = hashToken(cookies.pipflow_sid);
      const sess = db.user_sessions.find(
        (s) => s.tokenHash === tokenHash && !s.revokedAt && new Date(s.expiresAt).getTime() > now
      );
      if (sess) {
        const user = db.users.find((u) => u.id === sess.userId && u.status === 'ACTIVE');
        if (user) userId = user.id;
      }
    }

    if (cookies.pipflow_admin_sid) {
      const tokenHash = hashToken(cookies.pipflow_admin_sid);
      const sess = db.administrator_sessions.find(
        (s) => s.tokenHash === tokenHash && !s.revokedAt && new Date(s.expiresAt).getTime() > now
      );
      if (sess) {
        const admin = db.administrator_accounts.find((a) => a.id === sess.adminId && a.status === 'ACTIVE');
        if (admin) adminId = admin.id;
      }
    }

    return { userId, adminId };
  }

  public emitToUser(userId: string, event: string, payload: unknown): void {
    const data = JSON.stringify({ type: event, payload, timestamp: new Date().toISOString() });
    for (const client of this.clients) {
      if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    }
  }

  public emitToAdmins(event: string, payload: unknown): void {
    const data = JSON.stringify({ type: event, payload, timestamp: new Date().toISOString() });
    for (const client of this.clients) {
      if (client.adminId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    }
  }

  public broadcastTick(symbol: string, tick: unknown): void {
    const data = JSON.stringify({ type: 'market:tick', symbol, payload: tick });
    for (const client of this.clients) {
      if (client.subscribedSymbols.has(symbol) && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    }
  }

  public broadcastDerivStatus(status: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED', message?: string): void {
    const data = JSON.stringify({
      type: 'deriv:feed_status',
      payload: { status, message, timestamp: new Date().toISOString() },
    });
    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    }
  }
}

export const realtimeHub = new RealtimeHub();
