/**
 * Authentication: JWT signing/verification plus two middlewares.
 *
 *  - `requireAuth`  rejects requests without a valid token (used by /me).
 *  - `attachUser`   lenient: a valid token identifies the user; with no token it
 *                   falls back to a shared local user, so the app is usable
 *                   single-user/local without registering.
 */
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../env.js';
import { pool } from '../db/pool.js';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

// Augment Express's Request with the authenticated user.
declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

const LOCAL_EMAIL = 'local@transitlab.local';
const TOKEN_TTL = '30d';

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.displayName },
    env.jwtSecret,
    { expiresIn: TOKEN_TTL },
  );
}

function readBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

function verify(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, env.jwtSecret) as {
      sub: string;
      email: string;
      name: string;
    };
    return { id: payload.sub, email: payload.email, displayName: payload.name };
  } catch {
    return null;
  }
}

let localUserCache: AuthUser | null = null;

/** Lazily provision (once) and return the shared local user. */
export async function getLocalUser(): Promise<AuthUser> {
  if (localUserCache) return localUserCache;
  await pool.query(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, 'local-no-login', 'Local planner')
     ON CONFLICT (lower(email)) DO NOTHING`,
    [LOCAL_EMAIL],
  );
  const { rows } = await pool.query<{ id: string; email: string; display_name: string }>(
    'SELECT id, email, display_name FROM users WHERE lower(email) = lower($1)',
    [LOCAL_EMAIL],
  );
  localUserCache = { id: rows[0].id, email: rows[0].email, displayName: rows[0].display_name };
  return localUserCache;
}

/** Strict: require a valid JWT. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = readBearer(req);
  const user = token && verify(token);
  if (!user) {
    res.status(401).json({ error: 'authentication required' });
    return;
  }
  req.user = user;
  next();
}

/** Lenient: valid token → that user; no token → shared local user. */
export function attachUser(req: Request, res: Response, next: NextFunction): void {
  const token = readBearer(req);
  if (token) {
    const user = verify(token);
    if (!user) {
      res.status(401).json({ error: 'invalid or expired token' });
      return;
    }
    req.user = user;
    next();
    return;
  }
  getLocalUser()
    .then((local) => {
      req.user = local;
      next();
    })
    .catch(next);
}
