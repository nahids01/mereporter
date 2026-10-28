# MeReporter — deployable package (skeleton, NOT live)

A real, runnable Next.js 14 (App Router) skeleton for the MeReporter live deployment.
It is based only on the already-built MeReporter artifact's verified spec. It contains
**no demo data, no invented rankings, traffic, backlinks, locations or "connected" states,
and no key values** — only env var names.

Target live host (not yet deployed): `mereporter.nurulnahid.com`
Supabase project already created (verified separately, not by this repo):
- Name: `mereporter`
- Region: West Europe (London) — `eu-west-2`
- Hostname: `qyrflqvktqzalvfvmjwf.supabase.co`
- Status at creation: Healthy, Nano

## How to run locally

```bash
npm install
cp .env.example .env.local   # fill in real values locally only, never commit them
npm run dev                  # http://localhost:3000
npm run build                # production build check
npm start
```

## How to deploy on Vercel (parent agent / owner step — NOT done by this package)

1. Push this folder to the existing repo `https://github.com/nahids01/mereporter`
   (currently README-only; pushing is deliberately NOT done here).
2. In Vercel, import that repo (connect GitHub first — no Git provider was connected
   at last check), framework: Next.js.
3. In Vercel → Project → Settings → Environment Variables, set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY` (server-only; never expose it to the browser)
   - Optional later: `RESEND_API_KEY`, `SERP_API_KEY`, `CRON_SECRET`
4. In Supabase, run `supabase/schema.sql` in the SQL editor for the `mereporter`
   project before first use. It creates profiles/projects/keywords/metric_imports/reports
   with RLS. It inserts NO seed data.
5. Deploy, then test on the Vercel URL first: sign up → Pending screen → admin approves
   → approved user sees only their own projects → report shows no-data where data is missing.
6. Only after that works, add the custom domain in Vercel (Connect External:
   `mereporter.nurulnahid.com`) and add the matching DNS record at the external DNS
   provider. Hostinger was verified to hold NO DNS record for this subdomain, and
   nurulnahid.com's DNS is external, so a Hostinger-only record would not go live.
   Main site `nurulnahid.com` must stay untouched.

## What is genuinely working in this skeleton

- Next.js build (verified with `npm run build` in this workspace — see below).
- Supabase auth sign-up / sign-in pages; sign-up assigns admin/approved only to the
  two initial admin emails in `lib/access.ts`, everyone else starts Pending.
- Dashboard pending screen: pending users see only that locked screen.
- Ownership shape: projects have an `owner_id`; RLS in `supabase/schema.sql` restricts
  projects/keywords/metrics/reports to their owner.
- SERP and GBP keywords are separate (`kind: 'serp' | 'gbp'`) everywhere in the schema,
  the report builder, and the API shape.
- Monthly report builder (`lib/report.ts`): builds only from stored rows, marks missing
  sections as no-data, excludes null ranks from averages, and labels a report partial
  when any section has no data.
- `/api/health` returns only booleans (key-configured or not), never key values.
- API hardening (this update): `/api/projects` and `/api/report` require a valid
  Supabase JWT in `Authorization: Bearer <access token>` plus an approved
  profile (`lib/auth.ts`). `/api/projects` never trusts a caller-supplied
  `owner_id` — a created project is always owned by the authenticated caller.
  `/api/report` returns 404 for both a missing and an unauthorised project, so
  ownership cannot be probed. Admin status comes ONLY from the two emails in
  `lib/access.ts`; a stored `role: 'admin'` for any other email is downgraded
  to `user` in the API. `/api/cron/monthly` is scheduler-only (no user JWT can
  trigger all-projects reports) and refuses to run at all unless `CRON_SECRET`
  is set and presented as `Bearer <CRON_SECRET>`.
- Monthly cron route (`/api/cron/monthly`, `vercel.json` schedule 1st 09:00) drafts a
  report for every project from stored rows only. It does NOT send email.

## What still needs the owner's keys / input (NOT in this repo)

- **Supabase keys** (URL, publishable key, secret key): values must be copied from the
  Supabase project dashboard into Vercel env vars. This repo has only the names.
- **Resend key + verified sender + recipients**: monthly email sending is NOT wired up.
  Until then reports stay `draft` and are never marked `sent`. No real monthly email
  has been sent from this skeleton.
- **SERP key (SerpApi or DataForSEO)**: live SERP ranks and live GBP grid are NOT
  implemented. Without a key, those sections honestly stay no-data. No rank is estimated.
- **Google Cloud OAuth / PageSpeed / Bing Webmaster keys**: live GSC/GA4/Bing sync is
  NOT implemented. The only data path in this skeleton is stored rows / CSV-style imports
  via `metric_imports`.

## What is NOT yet ready — do not claim otherwise

- NOT live on `mereporter.nurulnahid.com` (no Vercel project, no DNS record, SSL still
  "Installing" in Hostinger at last check).
- NOT a full clone of the Muse artifact's dashboard, audit, competitors, backlinks,
  AI visibility, or white-label report UI — those are represented here only by the
  data model, access rules, and honest report builder, not by full pages.
- Admin Setup is a guard/documentation page in this skeleton, not a full admin UI
  (approve/reject, all-projects view, API-key management must be added as server routes).
  Note a related RLS limit: the browser Dashboard lists projects through the anon
  client, so an admin's list there is still RLS-limited to their own projects
  until a dedicated admin policy / admin server route is added. The hardened
  server routes above already give admins all-project access for reports; the
  dashboard list itself does not yet reflect that.
- `vercel.json` cron schedule `0 9 1 * *` is UTC in Vercel's scheduler; the
  intended 09:00 Europe/London time must still be confirmed in the Vercel dashboard.
- No code has been pushed to GitHub and no Vercel deployment has been made from this package.
