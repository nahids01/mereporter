import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

// Shared CRON_SECRET gate for scheduler-only routes (/api/cron/monthly,
// /api/cron/fetch). A user JWT must never trigger work for ALL projects, and
// an unset secret refuses to run at all rather than running unauthenticated.
// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically when
// CRON_SECRET is configured as an env var.
export function checkCronSecret(req: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 503, error: 'Cron secret not configured; refusing unauthenticated run.' };
  const auth = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  const match = auth.length === expected.length && timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
  if (!match) return { ok: false, status: 401, error: 'Unauthorized.' };
  return { ok: true };
}
