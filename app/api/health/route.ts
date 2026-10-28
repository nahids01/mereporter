import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase';
import { hasServerSupabase } from '@/lib/server';

// Returns only booleans, never key values.
export async function GET() {
  return NextResponse.json({
    ok: true,
    supabaseConfigured: isSupabaseConfigured(),
    serverSupabaseConfigured: hasServerSupabase(),
    serpApiConfigured: Boolean(process.env.SERP_API_KEY),
    resendConfigured: Boolean(process.env.RESEND_API_KEY),
  });
}
