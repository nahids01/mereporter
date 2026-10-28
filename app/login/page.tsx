'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase';

const brand = '#FF863B';

type EnsureResult =
  | { ok: true; profile: { id: string; email: string; role: string; status: string } }
  | { ok: false; error: string };

async function ensureProfile(token: string): Promise<EnsureResult> {
  const res = await fetch('/api/profile/ensure', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    return { ok: false, error: String(json.error ?? `Profile setup failed (${res.status})`) };
  }
  return { ok: true, profile: json.profile };
}

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  // When a user follows the Supabase password-reset link back to /login,
  // Supabase emits a PASSWORD_RECOVERY event and creates a recovery session.
  // Only then is the set-new-password form shown — it is never shown to a
  // casual visitor, and it can only set the password for that recovery session.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = getBrowserSupabase();
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setShowSetPassword(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handle(mode: 'signin' | 'signup') {
    setMessage('');
    setSignedIn(false);
    if (!isSupabaseConfigured()) {
      setMessage('Supabase is not configured yet. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in Vercel env vars.');
      return;
    }
    if (mode === 'signup' && password.length < 8) {
      setMessage('Password must be at least 8 characters.');
      return;
    }
    const supabase = getBrowserSupabase();
    const { data, error } = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email,
          password,
          // Full name is stored only in Supabase Auth user metadata.
          // There is no full_name column on the profiles table.
          options: { data: { full_name: fullName.trim(), display_name: fullName.trim() } },
        });
    if (error) { setMessage(error.message); return; }
    if (!data.user) { setMessage('Check your email to confirm your account, then sign in.'); return; }

    // The profile row must be created through the server ensure route:
    // the profiles table RLS has no insert/update policy, so a browser
    // upsert silently fails and the dashboard would show "No profile found".
    // Never claim a successful sign-in as admin/approved until ensure succeeds.
    const token = data.session?.access_token ?? null;
    if (!token) {
      setMessage('Check your email to confirm your account, then sign in here. Your profile will be created when you sign in.');
      return;
    }
    const ensured = await ensureProfile(token);
    if (!ensured.ok) {
      setMessage(`Signed in, but your profile could not be created: ${ensured.error} Please sign in again.`);
      return;
    }
    setSignedIn(true);
    if (ensured.profile.status === 'approved') {
      setMessage('Signed in. Redirecting to the dashboard…');
      router.push('/dashboard');
      return;
    }
    setMessage('Signed in. Status: PENDING — wait for an admin to approve you. Until then you will see only the pending screen.');
  }

  async function handleForgot() {
    setMessage('');
    if (!email) { setMessage('Enter your email above first, then use Forgot password.'); return; }
    if (!isSupabaseConfigured()) {
      setMessage('Supabase is not configured yet. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in Vercel env vars.');
      return;
    }
    const supabase = getBrowserSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    if (error) { setMessage(error.message); return; }
    setMessage('Password reset email sent. Check your inbox (and spam folder), follow the link to set a new password, then sign in here with the new password.');
  }

  async function handleSetPassword() {
    setMessage('');
    if (!newPassword) { setMessage('Enter a new password first.'); return; }
    if (!isSupabaseConfigured()) return;
    const supabase = getBrowserSupabase();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { setMessage(error.message); return; }
    setShowSetPassword(false);
    setNewPassword('');
    setMessage('New password saved. Sign in here with your email and the new password.');
  }

  const inputStyle: CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #2a2a2a',
    background: '#1a1a1a', color: '#fff', fontSize: 15, boxSizing: 'border-box', outline: 'none',
  };
  const labelStyle: CSSProperties = {
    display: 'block', color: '#9ca3af', fontSize: 12, fontWeight: 700,
    letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase',
  };

  return (
    <div style={{ background: '#000', minHeight: '100vh', margin: '-16px -16px 0', padding: '40px 16px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 440, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: brand, color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 22 }}>M</div>
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 20, lineHeight: 1.1 }}>MeReporter</div>
            <div style={{ color: '#9ca3af', fontSize: 12 }}>Rank · GBP Grid · AI Visibility · Monthly Reports</div>
          </div>
        </div>

        <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: 24 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <button
              onClick={() => { setTab('signin'); setMessage(''); }}
              style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 15, background: tab === 'signin' ? brand : '#1f1f1f', color: tab === 'signin' ? '#000' : '#d1d5db' }}
            >
              Log in
            </button>
            <button
              onClick={() => { setTab('signup'); setMessage(''); }}
              style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 15, background: tab === 'signup' ? brand : '#1f1f1f', color: tab === 'signup' ? '#000' : '#d1d5db' }}
            >
              Sign up
            </button>
          </div>

          {showSetPassword && (
            <div style={{ marginBottom: 16, border: '1px solid #444', background: '#1a1a1a', borderRadius: 12, padding: 16 }}>
              <p style={{ marginTop: 0, color: '#fff' }}><strong>Set a new password</strong> — you arrived here from a password-reset link.</p>
              <label style={labelStyle}>New password</label>
              <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" style={inputStyle} />
              <button onClick={handleSetPassword} style={{ marginTop: 12, width: '100%', padding: 12, borderRadius: 10, border: 'none', background: brand, color: '#000', fontWeight: 800, cursor: 'pointer' }}>
                Save new password
              </button>
            </div>
          )}

          {tab === 'signup' && (
            <>
              <label style={labelStyle}>Your name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} type="text" placeholder="Full name" style={{ ...inputStyle, marginBottom: 16 }} />
            </>
          )}
          <label style={labelStyle}>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@company.com" style={{ ...inputStyle, marginBottom: 16 }} />
          <label style={labelStyle}>Password</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder={tab === 'signup' ? 'At least 8 characters' : 'Your password'} style={inputStyle} />

          {tab === 'signup' ? (
            <button onClick={() => handle('signup')} style={{ marginTop: 20, width: '100%', padding: 14, borderRadius: 10, border: 'none', background: brand, color: '#000', fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>
              Create account
            </button>
          ) : (
            <button onClick={() => handle('signin')} style={{ marginTop: 20, width: '100%', padding: 14, borderRadius: 10, border: 'none', background: brand, color: '#000', fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>
              Log in
            </button>
          )}

          {tab === 'signup' ? (
            <p style={{ color: '#9ca3af', fontSize: 13, lineHeight: 1.6, margin: '16px 0 0' }}>
              New accounts start as Pending: an admin reviews and approves each account before the tool unlocks. Nothing is auto-approved.
              <br />
              <span style={{ color: '#d1d5db' }}>Initial admin accounts are approved on sign-in by the profile setup step.</span>
            </p>
          ) : (
            <p style={{ color: '#9ca3af', fontSize: 13, lineHeight: 1.6, margin: '16px 0 0' }}>
              Accounts are approved by an admin before the tool unlocks — a brand-new account will show a pending screen until then.
            </p>
          )}

          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <button onClick={() => setShowForgot((v) => !v)} style={{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: 14, textDecoration: 'underline' }}>
              Forgot password
            </button>
          </div>
          {showForgot && (
            <div style={{ marginTop: 16, border: '1px solid #2a2a2a', borderRadius: 12, padding: 16 }}>
              <p style={{ marginTop: 0, color: '#d1d5db', fontSize: 14, lineHeight: 1.6 }}>
                Enter your email above, then send a reset link. You will get an email with a link to set a new password — after that, sign in here with the new password.
              </p>
              <button onClick={handleForgot} style={{ width: '100%', padding: 12, borderRadius: 10, border: `1px solid ${brand}`, background: 'transparent', color: brand, fontWeight: 700, cursor: 'pointer' }}>
                Send password reset email
              </button>
            </div>
          )}

          {message && <p style={{ color: '#fca5a5', fontSize: 14, lineHeight: 1.6, margin: '16px 0 0' }}>{message}</p>}
          {signedIn && (
            <p style={{ margin: '16px 0 0' }}><a href="/dashboard" style={{ color: brand, fontWeight: 700 }}>Back to dashboard</a></p>
          )}
          <p style={{ color: '#6b7280', fontSize: 12, margin: '16px 0 0' }}>Do not paste any API key here.</p>
        </div>
      </div>
    </div>
  );
}
