import { createClient } from '@supabase/supabase-js';

// Server-only client. SUPABASE_SECRET_KEY must never be imported by a
// client component and must never be returned by an API route.
export function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error('Server Supabase is not configured: SUPABASE_SECRET_KEY is missing.');
  }
  return createClient(url, secret, { auth: { persistSession: false } });
}

export function hasServerSupabase() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}
