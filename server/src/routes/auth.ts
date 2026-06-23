/** Email/password authentication routes. */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth, signToken, type AuthUser } from '../middleware/auth.js';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(120),
});

const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

function toAuthUser(row: { id: string; email: string; display_name: string }): AuthUser {
  return { id: row.id, email: row.email, displayName: row.display_name };
}

authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid input', detail: parsed.error.issues[0]?.message });
    return;
  }
  const { email, password, displayName } = parsed.data;
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query<{ id: string; email: string; display_name: string }>(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES (lower($1), $2, $3)
       RETURNING id, email, display_name`,
      [email, hash, displayName],
    );
    const user = toAuthUser(rows[0]);
    res.status(201).json({ token: signToken(user), user });
  } catch (err) {
    // Unique violation on lower(email).
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'an account with that email already exists' });
      return;
    }
    res.status(500).json({ error: 'registration failed', detail: (err as Error).message });
  }
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid input' });
    return;
  }
  const { email, password } = parsed.data;
  try {
    const { rows } = await pool.query<{
      id: string;
      email: string;
      display_name: string;
      password_hash: string;
    }>('SELECT id, email, display_name, password_hash FROM users WHERE lower(email) = lower($1)', [
      email,
    ]);
    const row = rows[0];
    // Constant-ish behaviour: always run a compare to avoid user enumeration.
    const ok = row ? await bcrypt.compare(password, row.password_hash) : false;
    if (!row || !ok) {
      res.status(401).json({ error: 'invalid email or password' });
      return;
    }
    const user = toAuthUser(row);
    res.json({ token: signToken(user), user });
  } catch (err) {
    res.status(500).json({ error: 'login failed', detail: (err as Error).message });
  }
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});
