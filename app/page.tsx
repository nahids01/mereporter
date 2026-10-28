export default function Home() {
  return (
    <div>
      <h1>MeReporter — live deployment package</h1>
      <p>
        This is a runnable skeleton, not a finished product and not live yet.
        Sign in to use it. New accounts stay <strong>Pending</strong> until an admin approves them.
        Approved users see only their own projects. Reports use only stored or live data;
        missing data is shown as <strong>no-data</strong>, never invented.
      </p>
      <ul>
        <li><a href="/login">Sign in / Sign up</a></li>
        <li><a href="/dashboard">Dashboard (requires approved account)</a></li>
        <li><a href="/setup">Setup &amp; Team (admin only)</a></li>
        <li><a href="/api/health">API health check</a></li>
      </ul>
      <p><strong>Not yet ready:</strong> live SERP ranks, live GBP grid, live GSC/GA4/Bing sync, and monthly email sending — all of these need keys the owner has not supplied yet (see README).</p>
    </div>
  );
}
