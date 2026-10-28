'use client';
import { useState } from 'react';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { isInitialAdmin } from '@/lib/access';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  async function handle(mode: 'signin' | 'signup') {
    setMessage('');
    if (!isSupabaseConfigured()) {
      setMessage('Supabase is not configured yet. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in Vercel env vars.');
      return;
    }
    const supabase = getBrowserSupabase();
    const { data, error } = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    if (error) { setMessage(error.message); return; }
    if (mode === 'signup' && data.user) {
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
    setMessage('Signed in. Go to the dashboard.');
  }

  return (
    <div>
      <h1>Sign in / Sign up</h1>
      <p>New accounts stay Pending until an admin approves them. Do not paste any API key here.</p>
      <label>Email<br /><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" style={{ width: '100%', padding: 8 }} /></label>
      <br /><br />
      <label>Password<br /><input value={password} onChange={(e) => setPassword(e.target.value)} type="password" style={{ width: '100%', padding: 8 }} /></label>
      <br /><br />
      <button onClick={() => handle('signin')}>Sign in</button>{' '}
      <button onClick={() => handle('signup')}>Sign up</button>
      <p>{message}</p>
      <p><a href="/dashboard">Go to dashboard</a></p>
    </div>
  );
}
