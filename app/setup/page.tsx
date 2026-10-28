export default function SetupPage() {
  return (
    <div>
      <h1>Setup &amp; Team — admin only</h1>
      <p>
        This page is for admins only. In this skeleton it is a guard + documentation page: the real admin
        actions (approve/reject users, view all projects, set API keys) must be done through server routes
        that check the admin email list in lib/access.ts. API keys are stored as server env vars in Vercel,
        never displayed back, never committed, and never sent in chat.
      </p>
      <p>Initial admins only: the two admin emails in lib/access.ts. No other user is promoted automatically.</p>
      <p>Env var names (values are NOT in this repo): NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY.</p>
    </div>
  );
}
