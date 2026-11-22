import { NextFunction, Request, Response } from 'express';
import { store } from '../db/store.ts';
import { hashToken } from '../security/crypto.ts';
import { AdminRole, AdministratorAccountRecord, UserRecord, UserRole } from '../types.ts';

export interface AuthenticatedRequest extends Request {
  authUser?: UserRecord;
  authRoles?: UserRole[];
  authSessionId?: string;
  adminAccount?: AdministratorAccountRecord;
  adminSessionId?: string;
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(keyPrefix: string, maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (bucket.count >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests. Please wait before trying again.',
        retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
      });
    }
    bucket.count += 1;
    next();
  };
}

export function getCookieOptions(maxAgeMs: number, httpOnly = true) {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeMs,
  };
}

export function attachOptionalUser(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const token = req.cookies?.pipflow_sid as string | undefined;
  if (!token) return next();

  const tokenHash = hashToken(token);
  const db = store.snapshot();
  const now = Date.now();
  const sess = db.user_sessions.find(
    (s) => s.tokenHash === tokenHash && !s.revokedAt && new Date(s.expiresAt).getTime() > now
  );
  if (!sess) return next();

  const user = db.users.find((u) => u.id === sess.userId);
  if (!user || user.status !== 'ACTIVE') return next();

  req.authUser = user;
  req.authSessionId = sess.id;
  req.authRoles = db.user_roles.filter((r) => r.userId === user.id).map((r) => r.role);
  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.authUser) {
    return res.status(401).json({ error: 'Authentication required. Please log in to continue.' });
  }
  next();
}

export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // Exempt direct login/register/admin auth calls if no CSRF cookie yet, or verify double-submit token when present
  const cookieCsrf = req.cookies?.pipflow_csrf as string | undefined;
  const headerCsrf = req.headers['x-csrf-token'] as string | undefined;
  if (cookieCsrf && headerCsrf !== cookieCsrf) {
    return res.status(403).json({ error: 'Invalid CSRF verification token.' });
  }
  next();
}

const ALL_ADMIN_ROLES: AdminRole[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'FINANCE_ADMIN',
  'APP_MANAGER',
  'SUPPORT',
  'AUDITOR',
];

export function requireAdminAuth(allowedRoles: AdminRole[] = ALL_ADMIN_ROLES) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const token = req.cookies?.pipflow_admin_sid as string | undefined;
    if (!token) {
      return res.status(401).json({ error: 'Administrator authentication required.' });
    }
    const tokenHash = hashToken(token);
    const db = store.snapshot();
    const now = Date.now();
    const sess = db.administrator_sessions.find(
      (s) => s.tokenHash === tokenHash && !s.revokedAt && new Date(s.expiresAt).getTime() > now
    );
    if (!sess) {
      return res.status(401).json({ error: 'Administrator session expired or invalid.' });
    }
    const admin = db.administrator_accounts.find((a) => a.id === sess.adminId && a.status === 'ACTIVE');
    if (!admin) {
      return res.status(403).json({ error: 'Administrator account is disabled or missing.' });
    }
    if (!allowedRoles.includes(admin.role)) {
      return res.status(403).json({ error: 'Insufficient administrator permissions.' });
    }
    req.adminAccount = admin;
    req.adminSessionId = sess.id;
    next();
  };
}
