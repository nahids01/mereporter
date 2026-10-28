'use client';
import { useEffect, useState } from 'react';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase';
import type { Profile } from '@/lib/access';

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [projects, setProjects] = useState<Array<{ id: string; name: string; website_url: string }>>([]);
  const [message, setMessage] = useState('Loading…');

  useEffect(() => {
    (async () => {
      if (!isSupabaseConfigured()) { setMessage('Supabase is not configured yet.'); return; }
      const supabase = getBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setMessage('Not signed in. Go to /login.'); return; }
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile((prof as Profile) ?? null);
      if (!prof || prof.status !== 'approved') { setMessage(''); return; }
      const { data } = await supabase.from('projects').select('id,name,website_url').order('created_at');
      setProjects((data as typeof projects) ?? []);
      setMessage('');
    })();
  }, []);

  if (message) return <p>{message}</p>;
  if (!profile) return <p>No profile found. Sign up first, then wait for approval.</p>;
  if (profile.status === 'pending') {
    return (
      <div>
        <h1>Account pending approval</h1>
        <p><strong>STATUS: PENDING</strong></p>
        <p>You cannot use the tool yet. An admin must approve your account first. This screen is all a pending user can see.</p>
      </div>
    );
  }
  if (profile.status === 'rejected') return <p>Your account was rejected by an admin.</p>;

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Signed in as {profile.email} — role: {profile.role}. You see only your own projects (admins see all projects via the Setup page).</p>
      {projects.length === 0 ? (
        <p>No projects yet. This is honest empty state — no demo project, keyword or rank is pre-filled.</p>
      ) : (
        <ul>{projects.map((p) => <li key={p.id}>{p.name} — {p.website_url}</li>)}</ul>
      )}
      <p><a href="/projects">Projects</a> · <a href="/reports">Reports</a>{profile.role === 'admin' ? <> · <a href="/setup">Setup &amp; Team (admin only)</a></> : null}</p>
    </div>
  );
}
