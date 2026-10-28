'use client';
import { useEffect, useState } from 'react';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { isInitialAdmin } from '@/lib/access';

export default function LoginPage() {
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
    const supabase = getBrowserSupabase();
    const { data, error } = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    if (error) { setMessage(error.message); return; }
    if (!data.user) { setMessage('Check your email to confirm your account, then sign in.'); return; }

    if (mode === 'signup') {
      // Profile row is created by the user (or by a DB trigger if one is added).
      // Initial admins become admin/approved; everyone else starts Pending.
      await supabase.from('profiles').upsert({
        id: data.user.id,
        email,
        role: isInitialAdmin(email) ? 'admin' : 'user',
        status: isInitialAdmin(email) ? 'approved' : 'pending',
      });
      setMessage(isInitialAdmin(email)
        ? 'Account created as admin. You can use the dashboard.'
        : 'Account created. Status: PENDING — wait for an admin to approve you. Until then you will see only the pending screen.');
      return;
    }

    // Sign-in: never downgrade an existing approved profile, and never let
    // a non-admin promote themselves. Only an initial-admin email is ever
    // promoted, and only to admin/approved, regardless of any stored role.
    // If no profile row exists yet (e.g. signed up before a profile was
    // created), create it with the correct role/status.
    const { data: existing } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', data.user.id)
      .maybeSingle();
    if (!existing) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        email,
        role: isInitialAdmin(email) ? 'admin' : 'user',
        status: isInitialAdmin(email) ? 'approved' : 'pending',
      });
      setMessage(isInitialAdmin(email)
        ? 'Signed in as admin. Go to the dashboard.'
        : 'Signed in. Status: PENDING — wait for an admin to approve you. Until then you will see only the pending screen.');
    } else if (isInitialAdmin(email) && (existing.role !== 'admin' || existing.status !== 'approved')) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        email,
        role: 'admin',
        status: 'approved',
      });
      setMessage('Signed in as admin. Go to the dashboard.');
    } else if (existing.status === 'approved') {
      setMessage('Signed in. Go to the dashboard.');
    } else {
      setMessage('Signed in. Status: PENDING — wait for an admin to approve you. Until then you will see only the pending screen.');
    }
    setSignedIn(true);
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

  return (
    <div>
      <h1>Sign in / Sign up</h1>
      {showSetPassword && (
        <div style={{ marginBottom: 16, border: '1px solid #ffe0c7', background: '#fff7f1', borderRadius: 12, padding: 16 }}>
          <p style={{ marginTop: 0 }}><strong>Set a new password</strong> — you arrived here from a password-reset link.</p>
          <label>New password<br /><input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" style={{ width: '100%', padding: 8 }} /></label>
          <br /><br />
          <button onClick={handleSetPassword}>Save new password</button>
        </div>
      )}
      <p>New accounts stay Pending until an admin approves them. Do not paste any API key here.</p>
      <label>Email<br /><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" style={{ width: '100%', padding: 8 }} /></label>
      <br /><br />
      <label>Password<br /><input value={password} onChange={(e) => setPassword(e.target.value)} type="password" style={{ width: '100%', padding: 8 }} /></label>
      <br /><br />
      <button onClick={() => handle('signin')}>Sign in</button>{' '}
      <button onClick={() => handle('signup')}>Sign up</button>{' '}
      <button onClick={() => setShowForgot((v) => !v)}>Forgot password</button>
      {showForgot && (
        <div style={{ marginTop: 16, border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
          <p style={{ marginTop: 0 }}>Enter your email above, then send a reset link. You will get an email with a link to set a new password — after that, sign in here with the new password.</p>
          <button onClick={handleForgot}>Send password reset email</button>
        </div>
      )}
      <p>{message}</p>
      {signedIn && (
        <p><a href="/dashboard">Back to dashboard</a></p>
      )}
    </div>
  );
}
