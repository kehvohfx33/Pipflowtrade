import 'dotenv/config';
import http from 'http';
import path from 'path';
import fs from 'fs';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { createServer as createViteServer } from 'vite';
import { attachOptionalUser, requireCsrf } from './server/middleware/security.ts';
import authRoutes from './server/routes/auth.ts';
import derivRoutes, { handleDerivOAuthCallback } from './server/routes/deriv.ts';
import appsRoutes from './server/routes/apps.ts';
import userRoutes from './server/routes/user.ts';
import adminRoutes from './server/routes/admin.ts';
import tradingRoutes from './server/routes/trading.ts';
import { realtimeHub } from './server/services/realtime.ts';
import { derivMarketFeed } from './server/services/deriv-ws.ts';

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const isProd = process.env.NODE_ENV === 'production';

  app.set('trust proxy', 1);

  // Security Headers & Content Security Policy
  app.use(
    helmet({
      contentSecurityPolicy: isProd
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", "'unsafe-inline'"],
              styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
              fontSrc: ["'self'", 'https://fonts.gstatic.com'],
              imgSrc: ["'self'", 'data:', 'https:'],
              connectSrc: [
                "'self'",
                'wss:',
                'https://pipflowtrade.site',
                'https://*.pipflowtrade.site',
                'https://ws.derivws.com',
                'wss://ws.derivws.com',
                'https://api.derivws.com',
                'wss://api.derivws.com',
              ],
              frameSrc: [
                "'self'",
                'https://bot.pipflowtrade.site',
                'https://trader.pipflowtrade.site',
                'https://charts.pipflowtrade.site',
                'https://options.pipflowtrade.site',
              ],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
    })
  );

  // CORS allowlist for the main platform + four independent Vercel origins
  const allowedOrigins = new Set(
    [
      'https://pipflowtrade.site',
      'https://www.pipflowtrade.site',
      'https://bot.pipflowtrade.site',
      'https://trader.pipflowtrade.site',
      'https://charts.pipflowtrade.site',
      'https://options.pipflowtrade.site',
      process.env.APP_URL,
      process.env.FRONTEND_URL,
      process.env.PUBLIC_SITE_URL,
      process.env.VITE_API_URL,
      'http://localhost:3000',
    ].filter(Boolean) as string[]
  );

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (allowedOrigins.has(origin) || origin.endsWith('.run.app'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-CSRF-Token');
    }
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(attachOptionalUser);
  app.use('/api', requireCsrf);

  // Healthcheck for Render
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'pipflowtrade-main',
      derivFeedStatus: derivMarketFeed.status,
      timestamp: new Date().toISOString(),
    });
  });

  // Mount Domain API Routers
  app.use('/api/auth', authRoutes);
  app.use('/api/deriv', derivRoutes);
  app.use('/api/trading', tradingRoutes);
  app.use('/api', appsRoutes);
  app.use('/api', userRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/private-admin', adminRoutes);

  // Support Deriv OAuth2 callback even if developers.deriv.com points to /auth/callback, /oauth/callback, or /
  app.get('/auth/callback', handleDerivOAuthCallback);
  app.get('/oauth/callback', handleDerivOAuthCallback);
  app.get('/', (req, res, next) => {
    if (
      (typeof req.query.acct1 === 'string' && typeof req.query.token1 === 'string') ||
      (typeof req.query.code === 'string' && req.query.code.length > 0) ||
      (typeof req.query.error === 'string' && req.query.error.length > 0)
    ) {
      return handleDerivOAuthCallback(req as any, res);
    }
    next();
  });

  // Support optional ADMIN_PRIVATE_SLUG route from Render env (server-side only, requires admin session)
  const rawSlug = process.env.ADMIN_PRIVATE_SLUG?.trim() || process.env.VITE_ADMIN_PRIVATE_SLUG?.trim();
  const adminSlug = rawSlug ? rawSlug.replace(/^\/+/, '') : '';
  if (adminSlug) {
    app.get(`/${adminSlug}`, (_req, res) => {
      res.redirect('/#/admin');
    });
  }

  // Attach Real-Time WebSocket Hub & Start Live Deriv Market Relay
  realtimeHub.attach(server, (symbol) => {
    derivMarketFeed.ensureSymbolSubscribed(symbol);
  });
  derivMarketFeed.start();

  // Vite Middleware in Development / Static Dist in Production
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/ws')) return next();
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        return res.sendFile(indexHtml);
      }
      return res.status(404).send('Build artifacts not found. Run npm run build.');
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[pipflowtrade] Server listening on http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('[pipflowtrade] Fatal startup error:', err);
  process.exit(1);
});
