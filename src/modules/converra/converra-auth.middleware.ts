import { createHash } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { supabase } from '../supabase';

/**
 * Requires `Authorization: Bearer <Supabase access token>` from a signed-in dashboard user.
 * The token is checked against the same Supabase project the dashboard signs users in with
 * (SUPABASE_URL — the dashboard's NEXT_PUBLIC_SUPABASE_URL).
 * The user is exposed as res.locals.user = { id, email }.
 */
export interface DashboardUser {
  id: string;
  email: string | null;
}

const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 200;
const verified = new Map<string, { user: DashboardUser; until: number }>();

function tokenFrom(req: Request): string | null {
  const header = req.headers.authorization;
  const match = typeof header === 'string' ? /^Bearer\s+(.+)$/i.exec(header.trim()) : null;
  return match?.[1]?.trim() || null;
}

export async function requireDashboardUser(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'OPTIONS') return next();

  const token = tokenFrom(req);
  if (!token) return res.status(401).json({ success: false, error: 'Sign in to continue' });

  // Status is polled every few seconds while a sync runs — don't hit Supabase Auth each time.
  const key = createHash('sha256').update(token).digest('hex');
  const cached = verified.get(key);
  if (cached && cached.until > Date.now()) {
    res.locals.user = cached.user;
    return next();
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      verified.delete(key);
      return res.status(401).json({ success: false, error: 'Your session has expired — sign in again' });
    }
    const user: DashboardUser = { id: data.user.id, email: data.user.email ?? null };
    if (verified.size >= CACHE_MAX) verified.clear();
    verified.set(key, { user, until: Date.now() + CACHE_TTL_MS });
    res.locals.user = user;
    return next();
  } catch (err) {
    console.error('[ConverraAuth] Failed to verify the session:', err);
    return res.status(503).json({ success: false, error: 'Couldn’t verify your session — try again' });
  }
}

export function currentUserEmail(res: Response): string | null {
  return (res.locals.user as DashboardUser | undefined)?.email ?? null;
}
