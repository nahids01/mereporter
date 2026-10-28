import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase';
import { hasServerSupabase } from '@/lib/server';
import { authenticateRequest } from '@/lib/auth';

// Returns only booleans, never key values. DATAFORSEO VISIBILITY IS
// ADMIN-ONLY: dataforseoConfigured is included only for an authenticated
// admin (the two initial admin emails). Unauthenticated callers and
// non-admins get no dataforseoConfigured field at all — no name, no
// boolean, no clue that it exists — so the public /api/health link on the
// home page cannot leak it.
export async function GET() {
  const auth = await authenticateRequest(new Request('http://localhost/api/health'));
  const isAdmin = auth.ok && auth.profile.role === 'admin';
  return NextResponse.json({
    ok: true,
    isAdmin,
    supabaseConfigured: isSupabaseConfigured(),
    serverSupabaseConfigured: hasServerSupabase(),
    serpApiConfigured: Boolean(process.env.SERP_API_KEY),
    ...(isAdmin ? { dataforseoConfigured: Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD) } : {}),
    pagespeedConfigured: Boolean(process.env.GOOGLE_PAGESPEED_API_KEY),
    resendConfigured: Boolean(process.env.RESEND_API_KEY),
  });
}
