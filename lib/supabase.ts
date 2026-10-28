import { createClient } from '@supabase/supabase-js';

// Browser-safe client: only the publishable key is ever exposed to the browser.
// The secret key is used ONLY on the server (see lib/server.ts) and is never
// imported by client components.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function getBrowserSupabase() {
  if (!url || !publishableKey) {
    throw new Error('Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  }
  return createClient(url, publishableKey);
}

export function isSupabaseConfigured() {
  return Boolean(url && publishableKey);
}
